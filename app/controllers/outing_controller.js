// import consts from '../consts.js';
// import Routific  from 'routific';
import async from 'async';
import request from 'request';
import Outing from '../models/outing_model';
import Step from '../models/step_model';
const UserController = require('../controllers/user_controller');
import dotenv from 'dotenv';
dotenv.config({ silent: true });

/*
This function returns all outings in the database.
*/
export const getSteps = (req, res) => {
    Step.find({}, (err, obj) => { res.send(obj); });
};

/*
This function (used by the SMS bot) pulls a random outing from the database.
*/
export const getRandomStep = (req, res) => {
    Step
        .count()
        .exec((err, count) => {
            const skip = Math.floor(Math.random() * count);
            Step.findOne().skip(skip).exec((err, obj) => {
                if (err) {
                    return res.send();
                }
                res.json({ message: obj });
            });
        });
};

// function to optimize route using Routific API.
// export const optimizeRouteRoutific = (req, res, outing) => {
//     const data = {};
//     const visits = {};

//     data.visits = visits;

//     for (let i = 0; i < outing.length; i++) {
//         const stepLocation = {
//             location: {
//                 name: outing[i].title,
//                 lat: outing[i].lat,
//                 lng: outing[i].lng,
//             },
//         };
//         data.visits[outing[i]._id] = stepLocation;
//     }

//     data.fleet = {
//         vehicle_1: {
//             start_location: {
//                 id: 'initialLocation',
//                 name: 'Baker Berry',
//                 lat: 43.705267,
//                 lng: -72.288719,
//             },
//         },
//     };

//     const options = {
//         url: 'https://api.routific.com/v1/vrp',
//         json: data,
//         headers: {
//             Authorization: `bearer ${process.env.ROUTIFIC_KEY}`,
//         },
//     };
//     function callback(error, response, body) {
//         if (!error && response.statusCode == 200) {
//             const lookup = {};
//             for (let j = 0; j < outing.length; j++) {
//                 lookup[outing[j]._id] = outing[j];
//             }
//             const finalResult = [];

//             const solution = body.solution;
//             const route = solution.vehicle_1;

//             // NOTE: Starting at 1 because initial location is start location
//             for (let k = 1; k < route.length; k++) {
//                 const nextId = route[k].location_id;
//                 finalResult.push(lookup[nextId]);
//             }
//             res.json({
//                 detailedSteps: finalResult,
//             });
//         } else {
//             // ... Handle error
//             res.send(error);
//         }
//     }
//     request.post(options, callback);
// };

/*
This function saves the generated outing to the outings collection and calls
a function to save the generated outing to the user's currentOuting field.
*/
export const saveAndReturnOuting = (req, res, detailedSteps, stepIds) => {
    const outing = new Outing();
    outing.detailedSteps = detailedSteps;
    outing.stepIds = stepIds;

    outing.save()
        .then(result => {
            const userId = req.user._id;
            UserController.saveCurrentOutingProgress(res, userId, result._id, 0);
            res.json({
                detailedSteps,
            });
        })
    .catch(error => {
        res.send(error);
    });
};

/*
This function uses the RouteXL API to optimized the generated outing based on the user's current
location so that the user is sent on the most efficient route.
*/
export const optimizeRouteXL = (req, res, warmup, outing, stepIds) => {
    const locations = [];

    const theGreen = {
        address: 'Green',
        lat: 43.705267,
        lng: -72.288719,
    };

    // optimized route starts with large outing
    for (let i = 0; i < outing.length; i++) {
        const stepLocation = {
            address: outing[i].title,
            lat: `${outing[i].loc.coordinates[1]}`,
            lng: `${outing[i].loc.coordinates[0]}`,
        };
        locations.push(stepLocation);
    }

    // TODO: Push end location as phone's current location (for now, pushing Dartmouth Green)
    locations.push(theGreen);

    const routeXLAuth = new Buffer(`${process.env.ROUTEXL_USERNAME}:${process.env.ROUTEXL_PASSWORD}`).toString('base64');
    const auth = `Basic ${routeXLAuth}`;

    const options = {
        url: 'https://api.routexl.nl/tour',
        form: { locations },
        headers: {
            Authorization: auth,
        },
    };

    function callback(error, response, body) {
        if (!error && response.statusCode === 200) {
            // create map
            const lookup = {};
            for (let j = 0; j < outing.length; j++) {
                lookup[outing[j].title] = outing[j];
            }
            const finalResult = [];
            const parsedResult = JSON.parse(body);
            const finalRoute = parsedResult.route;
            let length = 0;
            for (const step in finalRoute) {
                if (finalRoute.hasOwnProperty(step)) {
                    length++;
                }
            }
            finalResult.push(warmup);
            // start at 1, end at length -1 to remove the Green from outing
            for (let k = 0; k < length - 1; k++) {
                const nextStepName = finalRoute[k].name;
                finalResult.push(lookup[nextStepName]);
            }

            saveAndReturnOuting(req, res, finalResult, stepIds);
        } else {
            res.send(error);
        }
    }
    request.post(options, callback);
};

/*
This function fills in the remainder of the outing, based on the duration and location of
the main step and the warmup.
*/
export const completeOuting = (req, res, warmup, outing, remainingDuration, stepIds) => {
    // get desired radius from client
    // NOTE: must have enough populated outings for small radii to work!
    let miles;
    if (req.query.radius) {
        miles = req.query.radius;
    } else {
        miles = 3;
    }

    const radiusInRadians = miles / 3959;
    if (remainingDuration === 0) {
        optimizeRouteXL(req, res, warmup, outing, stepIds);
    } else if (remainingDuration > 0) {
        const jsonObject = outing[0].toJSON();

        // query for steps within a given radius and that have not already been added to the outing
        const query = {
            loc: {
                $geoWithin: {
                    $centerSphere: [jsonObject.loc.coordinates, radiusInRadians],
                },
            },
            _id: {
                $nin: stepIds,
            },
            warmup: 0,
        };

        Step
            .find(query).where('duration').lte(remainingDuration).
            exec((err, steps) => {
                const arrayLength = steps.length;
                const step = steps[Math.floor(Math.random() * arrayLength)];
                outing.push(step);
                stepIds.push(step._id);
                const newRemainingDuration = remainingDuration - step.duration;
                completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds);
            });
    }
};

/*
This function pulls a warmup (flagged as a 1 in the warmup field) from the database that is
within a close range to the main activity of the outing. When the outing is fully generated, the
user is sent on this warmup prior to the rest of the steps in the outing.
*/
export const getWarmup = (req, res, outing, remainingDuration, stepIds) => {
    // get close by activity for warmup
    // TODO: change this to .5 once we populate warmups!
    const miles = 5;
    const radiusInRadians = miles / 3959;
    const jsonObject = outing[0].toJSON();

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [jsonObject.loc.coordinates, radiusInRadians],
            },
        },
        _id: {
            $nin: stepIds,
        },
        warmup: 1,
    };

    // get all results, then index randomly into array
    Step
        .find(query).
        exec((err, steps) => {
            const arrayLength = steps.length;
            const warmup = steps[Math.floor(Math.random() * arrayLength)];

            // obj is the warmup activity; all warmups are 1 hour duration
            stepIds.push(warmup._id);
            const newRemainingDuration = remainingDuration - warmup.duration;

            if (newRemainingDuration === 0) {
                // add the warmup to the activity
                const finalResult = [];
                finalResult.push(warmup);
                finalResult.push(outing[0]);
                // return
                saveAndReturnOuting(req, res, finalResult, stepIds);
            } else {
                completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds);
            }
        });
};

/*
This function is called when an outing is requested. It pulls the MAIN outing event from the
database, which currently is calculated based on the user's duration and location. It then calls
getWarmup (if the duration is not already filled) to continue to populate the outing.
*/
export const initiateOuting = (req, res) => {
    const duration = req.query.duration;

    // TODO: will need to change this when an activity doesn't have unlimited participants
    const halfDuration = Math.ceil(duration / 2);
    const outing = [];
    const stepIds = [];

    // find significant outing (i.e. at least half time of outing)
    Step
        .find({ duration: halfDuration, warmup: 0 }).
        exec((err, steps) => {
            // Randomly pull outing from array
            const arrayLength = steps.length;
            const step = steps[Math.floor(Math.random() * arrayLength)];
            outing.push(step);
            stepIds.push(step._id);
            const newRemainingDuration = req.query.duration - step.duration;
            if (newRemainingDuration === 0) {
                saveAndReturnOuting(req, res, outing, stepIds);
            } else {
                getWarmup(req, res, outing, newRemainingDuration, stepIds);
            }
        });
};

/*
This function queries the database for an alternate step in a generated outing. It returns an alternate step
if one is available and otherwise returns an error.
*/
export const skipStep = (req, res) => {
    const offendingStepId = req.query.skip;
    const currentOutingId = req.query.outingId;
    // TODO: remove hard coded step and outing Ids
    // const offendingStepId = "57f59c5674746a6754df0d4b";
    // const currentOutingId = "58361382fa73dd1b031a4e49";

    // Get step and outing by ID
    const asyncTasks = [];

    asyncTasks.push(function(callback) {
        try {
            Step.findOne({ _id: offendingStepId }).exec(callback);
        } catch (error) {
            callback(error);
        }
    });

    asyncTasks.push(function(callback) {
        try {
            Outing.findOne({ _id: currentOutingId }).exec(callback);
        } catch (error) {
            callback(error);
        }
    });

    async.parallel(asyncTasks, function(err, results) {
        if (err) {
            throw err;
        }

        const offendingStep = results[0];
        const currentOuting = results[1];
        const currentOutingSteps = currentOuting.detailedSteps;
        const miles = 5;
        const radiusInRadians = miles / 3959;

        if (offendingStep.warmup === 1) {
            // query on currentOuting[1] because the main event will be the second item in the array
            const query = {
                loc: {
                    $geoWithin: {
                        $centerSphere: [currentOutingSteps[1].loc.coordinates, radiusInRadians],
                    },
                },
                _id: {
                    $nin: currentOuting.stepIds,
                },
                warmup: 1,
            };

            Step
                .find(query).
                exec((err, steps) => {
                    const arrayLength = steps.length;
                    const warmup = steps[Math.floor(Math.random() * arrayLength)];

                    // TODO: replace current stepIds with new warmup Id
                    res.send(warmup);
                    // TODO: replace outing detailedSteps with warmup step
                    // TODO: if it qualifies, replace featured step with new step
                    // stepIds.push(warmup._id);
                    // TODO: If no other warmup exists, return error
                    // TODO: call updateOuting to replace stepIds and detailedSteps
                });
        } else {
            // If offendingStep is not a warmup, query DB for another activity in the area that is same duration
            const query = {
                loc: {
                    $geoWithin: {
                        $centerSphere: [currentOutingSteps[1].loc.coordinates, radiusInRadians],
                    },
                },
                _id: {
                    $nin: currentOuting.stepIds,
                },
                warmup: 0,
                duration: offendingStep.duration,
            };

            Step
                .find(query).
                exec((err, steps) => {
                    const arrayLength = steps.length;
                    const newStep = steps[Math.floor(Math.random() * arrayLength)];

                    // TODO: replace current stepIds with new warmup Id
                    res.send(newStep);
                    // TODO: replace outing detailedSteps with warmup step
                    // TODO: if it qualifies, replace featured step with new step
                    // stepIds.push(warmup._id);
                    // TODO: If no other warmup exists, return error
                    // TODO: call updateOuting to replace stepIds and detailedSteps
                });
        }
    });
};

/*
This function is first called when the outing endpoint is hit, handling the request according to
which parameters are specified.
*/
export const handleOutingRequest = (req, res) => {
    if (req.query.outingId && req.query.skip) {
        skipStep(req, res);
    } else {
        initiateOuting(req, res);
    }
};

/*
This function (used by the SMS bot) pulls a random outing from the database.
*/
export const getRandomOutingStudy = (callback) => {
    Step
        .count()
        .exec((err, count) => {
            const skip = Math.floor(Math.random() * count);
            Step.findOne().skip(skip).exec(callback);
        });
};
