// import consts from '../consts.js';
// import Routific  from 'routific';
import async from 'async';
import CONST from '../consts';
import nodemailer from 'nodemailer';
import request from 'request';

import Outing from '../models/outing_model';
import Route from '../models/route_model';
import Step from '../models/step_model';

import dotenv from 'dotenv';
dotenv.config({ silent: true });

const RouteController = require('../controllers/route_controller');
const UserController = require('../controllers/user_controller');

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

/*
This function stores a series of steps created by the user as one complete outing. Note:
does not verify that each individual step was created by the user who is submitting the outing
(because I think it's okay for a user to pick from currently available steps), but we may want
to think about this in the future.

In order for a user to submit a full outing, they will first need to submit each individual step.
*/
export const submitOuting = (req, res) => {
    if (!req.query.orderedSteps) {
        res.status(400).send('No steps specified for outing');
    }

    const steps = req.query.orderedSteps;
    const detailedSteps = [];

    const promises = [];

    for (const step in steps) {
        promises.push(Step.findOne({ _id: steps[step] }));
    }

    Promise.all(promises).then(function(stepsArray) {
        stepsArray.forEach(function(step) {
            detailedSteps.push(step);
        });
        const outing = new Outing();
        outing.author = req.user._id;
        outing.detailedSteps = detailedSteps;
        outing.stepIds = req.query.orderedSteps;

        outing.save()
            .then(result => {
                res.status(200).send('Successfully submitted outing');
            })
        .catch(error => {
            res.send(error);
        });
    });
};

/*
This function, given a user's input rating of an outing, updates the outing's rating
to account for the new submission.

TODO: Doesn't currently check whether the user has already rated the outing, so technically
the user could submit several ratings for the same outing (fix).
*/
export const updateOutingRating = (outingId, rating, res, callback) => {
    Outing.findOne({ _id: outingId }).exec((err, outing) => {
        if (err) {
            callback(404, 'Outing not found in DB; check outing ID');
        } else if (rating === undefined) {
            // just save outing reflection
            callback(200, 'Outing reflection saved without rating', outing);
        } else {
            let currentAverage;
            let currentDistribution;
            if (outing.rating) {
                currentAverage = parseInt(outing.rating);
            } else {
                currentAverage = 0;
            }
            if (outing.raters) {
                currentDistribution = parseInt(outing.raters);
            } else {
                currentDistribution = 0;
            }

            const newAverageNumerator = parseInt(currentAverage) * parseInt(currentDistribution) + parseInt(rating);
            const newAverageDenominator = parseInt(currentDistribution) + 1;
            const newAverage = newAverageNumerator * 1.0 / newAverageDenominator;

            Outing.findOneAndUpdate(
                { _id: outingId },
                { $set: { rating: newAverage, raters: newAverageDenominator },
                },
                (error, outing) => {
                    if (error) {
                        callback(404, 'Error updating outing with new rating');
                    } else {
                        callback(200, 'Success updating outing with rating and reflection', outing);
                    }
                });
        }
    });
};

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
            UserController.inviteFriends(req, res, result._id);
            res.json({
                outingId: result._id,
                detailedSteps,
            });
        })
    .catch(error => {
        res.send(error);
    });
};

// Helper function to convert coordinates to radians
function toRadians(x) {
    return x * Math.PI / 180;
}

/*
This function, given a startStep, finds the step among all the remaining steps that is closest
using the Haversine Distance Formula and returns the index of this step in the outing array.
*/
export const findClosestStep = (startStep, outing, callback) => {
    let minDist = Number.POSITIVE_INFINITY;
    let minStepIndex;
    for (let i = 0; i < outing.length; i++) {
        if (outing[i] !== null) {

            // Calculate distance between coordinates of startStep and outingStep
            // source: http://www.movable-type.co.uk/scripts/latlong.html
            const R = 6371e3; // metres
            const φ1 = toRadians(startStep.loc.coordinates[1]);
            const φ2 = toRadians(outing[i].loc.coordinates[1]);
            const Δφ = toRadians(outing[i].loc.coordinates[1] - startStep.loc.coordinates[1]);
            const Δλ = toRadians(outing[i].loc.coordinates[0] - startStep.loc.coordinates[0]);

            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                    Math.cos(φ1) * Math.cos(φ2) *
                    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            const distance = R * c;
            if (distance < minDist) {
                minDist = distance;
                minStepIndex = i;
            }
        }
    }
    callback(minDist, minStepIndex);
};


/*
This function optimizes the generated outing based on the user's current
location so that the user is sent on the most efficient route. Temporarily using brute force;
I hope to modify this soon to use a dynamic programming approach. Note: this will not currently work
with time-sensitive events.
*/
export const optimizeRoute = (req, res, warmup, outing, stepIds) => {
    const finalResult = [];

    finalResult.push(warmup);
    finalResult.push(outing[0]); // main step
    let firstStep = outing[0];
    let hasLinkedPost = outing[0].linkedPost === true;
    let firstStepIndex = 0;
    // remove main step from the outing
    outing.splice(0, 1);


    // If we go directly from the main step to the final step, no need to calculate route
    if (outing.length === 1) {
        finalResult.push(outing[0]);
        saveAndReturnOuting(req, res, finalResult, stepIds);
    } else {
        const unsortedStepIds = stepIds.slice();
        let sortedStepIds = stepIds.slice();

        // Remove the warmup from sortedStepIds and unsortedStepIds. TODO: change if warmup comes later
        const warmupIndex = stepIds.indexOf(warmup._id);
        unsortedStepIds.splice(warmupIndex, 1);
        sortedStepIds.splice(warmupIndex, 1);
        const routeToSave = [];
        let currentRouteArray = [];

        // Prepare for saving final route in DB; note that this final route is SPECIFIC to the main step
        let finalRouteToSaveIdString = '';
        routeToSave.push(firstStep._id);
        sortedStepIds.sort();
        for (const id in sortedStepIds) {
            finalRouteToSaveIdString += sortedStepIds[id];
        }

        async.whilst(
            // test function
            function() {
                return outing.length > 1;
            },
            // iteratee function
            function(callback) {

                // If there is a linked post activity after the main, add it to the outing without optimizing the route
                if (hasLinkedPost) {
                    // remove main step from stepIds and just start query at the post
                    finalResult.push(outing[0]);
                    routeToSave.push(outing[0]);
                    unsortedStepIds.splice(0, 1);

                    // Set firstStep equal to the linked post, then remove it from steps to compare distances to
                    firstStep = outing[0];
                    outing.splice(0, 1);
                    hasLinkedPost = false;
                }
                // Create sortedStepIdString of all steps we need sorted, in order to check if it is in DB
                sortedStepIds = unsortedStepIds.slice();
                sortedStepIds.sort();
                let sortedStepIdString = '';
                for (const id in sortedStepIds) {
                    sortedStepIdString += sortedStepIds[id];
                }

                // Check if this route already exists in the DB, starting at the designated firstStep
                const routeQuery = Route.find({ stepIds: sortedStepIdString, startStep: firstStep._id });


                routeQuery.exec((err, route) => {
                    if (route === undefined || route.length === 0) {

                        // If route does not exist in DB, calculate the next best step using brute force
                        findClosestStep(firstStep, outing, function(minDistance, minStepIndex) {

                            // Add this next step to list of new routes to save
                            routeToSave.push(outing[minStepIndex]._id);

                            // Add next step to final outing; update firstStep to be this step
                            finalResult.push(outing[minStepIndex]);
                            firstStep = outing[minStepIndex];
                            console.log('min step index event' + outing[minStepIndex]);
                            outing.splice(minStepIndex, 1);
                            console.log('unsorted before splicing' + unsortedStepIds);
                            // TODO: I think below is a bug? Shouldn't it be setting firstStepIndex first
                            unsortedStepIds.splice(firstStepIndex, 1);
                            console.log('unsorted after splicing' + unsortedStepIds);
                            firstStepIndex = minStepIndex;

                            callback(null, outing);
                        });
                    } else {
                        // Else, use the precalculated route from the DB
                        // For each step ID in route, add it to finalResult
                        for (let i = 0; i < route[0].route.length; i++) {
                            let index;
                            for (let j = 0; j < unsortedStepIds.length; j++) {
                                if (route[0].route[i].toString() == unsortedStepIds[j].toString()) {
                                    index = j;
                                    finalResult.push(outing[index]);
                                    unsortedStepIds.splice(index, 1);
                                    outing.splice(index, 1);
                                }
                            }
                        }

                        // Notify myself!
                        const transporter = nodemailer.createTransport('SMTP', {
                            service: 'Gmail',
                            auth: {
                                user: process.env.APP_EMAIL,
                                pass: process.env.APP_PASSWORD,
                            },
                        });

                        // email info
                        const mailOptions = {
                            from: `"Outing Buddy App 👥" <${process.env.APP_EMAIL}>`, // sender address
                            to: `${process.env.APP_EMAIL}`,
                            subject: 'Previous route used!',
                            text: `Used a previous route! ${route[0].route} Woohoo!`,
                        };

                        // send mail with defined transport object
                        transporter.sendMail(mailOptions, function(error, info) {
                            if (error) {
                                return console.log(error);
                            }
                        });
                        callback(null, outing);
                    }
                });
            },
            // callback function; called when test fails
            function (err, outing) {

                // Add final step to outing, if outing still has one more step
                if (outing.length !== 0) {
                    finalResult.push(outing[0]);
                    routeToSave.push(outing[0]._id);
                }

                // Save calculated route; save and return outing
                RouteController.saveRoute(routeToSave[0], finalRouteToSaveIdString, routeToSave);
                saveAndReturnOuting(req, res, finalResult, stepIds);
            }
        );
    }
};

/*
This function uses the RouteXL API to optimized the generated outing based on the user's current
location so that the user is sent on the most efficient route.
*/
export const optimizeRouteXL = (req, res, warmup, outing, stepIds) => {
    const locations = [];

    // optimized route starts with large outing
    for (let i = 0; i < outing.length; i++) {
        const stepLocation = {
            address: outing[i].title,
            lat: `${outing[i].loc.coordinates[1]}`,
            lng: `${outing[i].loc.coordinates[0]}`,
        };
        locations.push(stepLocation);
    }

    let finalLocation;
    if (req.query.lat && req.query.lng) {
        finalLocation = {
            address: 'finalLocation',
            lat: req.query.lat,
            lng: req.query.lng,
        };
    } else {
        finalLocation = {
            address: 'Green',
            lat: 43.705267,
            lng: -72.288719,
        };
    }
    locations.push(finalLocation);

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
        if (error) {
            console.log('got an error' + error);
        }
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
export const completeOuting = (req, res, warmup, outing, remainingDurationMinutes, stepIds, moneyToSpend) => {
    // get acceptable travel radius from client
    // NOTE: must have enough populated outings for small radii to work!
    let miles;
    if (req.query.radius) {
        miles = req.query.radius;
    } else {
        miles = 3;
    }
    const radiusInRadians = miles / 3959;
    if (remainingDurationMinutes <= 15) {
        // TODO: could have 15 min activities
        optimizeRoute(req, res, warmup, outing, stepIds);
    } else if (remainingDurationMinutes > 15) {
        const jsonObject = outing[0].toJSON();

        let acceptableDurationsCounter = remainingDurationMinutes;
        const acceptableDurations = [];
        let durationMinimum;
        // We don't want to send user on too many small tasks.
        if (remainingDurationMinutes > 60) {
            durationMinimum = 60;
        // TODO: Fix this.
        } else if (remainingDurationMinutes > 30) {
            durationMinimum = 30;
        } else {
            durationMinimum = 0;
        }
        while (acceptableDurationsCounter > durationMinimum) {
            acceptableDurations.push(acceptableDurationsCounter);
            acceptableDurationsCounter -= 15;
        }

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
            durationRange: { $in: acceptableDurations },
            warmup: 0,
            approved: 1,
            repeat_start: null,
            minPrice: { $lte: moneyToSpend },
        };

        // if (req.query.active === 0) {
        //     query.active = { $in: [0, 1] };
        // }

        console.log('remaining duration in complete outing is ' + remainingDurationMinutes);
        const stepQuery = Step.find(query);

        if (req.query.active) {
            if (req.query.active === 0) {
                stepQuery.where('active', 0);
            } else if (req.query.active === 1) {
                stepQuery.active = { $in: [0, 1] };
            } else {
                stepQuery.active = { $in: [0, 1, 2, 3] };
            }
        }

        stepQuery.exec((err, steps) => {
            // TODO (potentially): if steps returned is equal to 0, query around home's coordinates (rather than main activity's coordinates)
            if (steps.length === 0 || steps === undefined) {
                console.log('got insufficient activities');
                return res.status(404).send('Insufficient activities found in area; try lowering duration or increasing price?');
            }

            const arrayLength = steps.length;
            const step = steps[Math.floor(Math.random() * arrayLength)];
            const availableDuration = step.durationRange;
            let midpointIndex = Math.round((availableDuration.length - 1) / 2);
            let midpointDuration = availableDuration[midpointIndex];
            while (acceptableDurations.indexOf(midpointDuration) === -1) {
                midpointIndex -= 1;
                midpointDuration = availableDuration[midpointIndex];
            }
            step.duration = midpointDuration;

            if (step.avgPrice <= moneyToSpend) {
                step.spend = step.avgPrice;
                moneyToSpend -= step.avgPrice;
            } else {
                // For now, just take the min price
                step.spend = step.minPrice;
                moneyToSpend -= step.minPrice;
            }

            outing.push(step);
            stepIds.push(step._id);
            const newRemainingDuration = remainingDurationMinutes - step.duration;
            completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds, moneyToSpend);
        });
    }
};

/*
This function pulls a warmup (flagged as a 1 in the warmup field) from the database that is
within a close range to the main activity of the outing. When the outing is fully generated, the
user is sent on this warmup prior to the rest of the steps in the outing.
*/
export const getWarmup = (req, res, outing, remainingDuration, stepIds, moneyToSpend, warmupLength) => {
    // get close by activity for warmup
    // TODO: change this to .5 once we populate warmups!
    console.log('remaining duration at warmup is ' + remainingDuration);
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
        approved: 1,
        repeat_start: null,
        minPrice: { $lte: moneyToSpend },
    };

    const warmupQuery = Step.find(query);

    if (req.query.active) {
        if (req.query.active === 0) {
            warmupQuery.where('active', 1);
        }
        // commenting this out for now because need to figure out what kind of prep each active step requires
        // if (req.query.active > 1) {
        //     warmupQuery.where('active', 2);
        // }
    }

    // get all results, then index randomly into array
    warmupQuery.exec((err, steps) => {
        if (steps === undefined || steps.length === 0) {
            // TODO: In future should just check for alternate steps instead!
            return res.status(404).send('There are no warmups in this area :(');
        }
        const arrayLength = steps.length;
        const warmup = steps[Math.floor(Math.random() * arrayLength)];

        // obj is the warmup activity; all warmups are 1 hour duration
        stepIds.push(warmup._id);

        if (warmup.avgPrice <= moneyToSpend) {
            warmup.spend = warmup.avgPrice;
            moneyToSpend -= warmup.avgPrice;
        } else {
            // For now, just take the min price
            warmup.spend = warmup.minPrice;
            moneyToSpend -= warmup.minPrice;
        }

        let newRemainingDuration;
        // If minutes until event have been specified
        if (warmupLength) {
            warmup.duration = Math.floor(warmupLength);
            const remainingDurationMinutes = remainingDuration - warmupLength;
            const leftoverMinutes = remainingDurationMinutes % 30;
            if (leftoverMinutes === 0) {
                newRemainingDuration = remainingDurationMinutes;
            } else if (leftoverMinutes <= 15) {
                newRemainingDuration = remainingDurationMinutes - leftoverMinutes;
            } else {
                newRemainingDuration = remainingDurationMinutes + (30 - leftoverMinutes);
            }
        } else {
            newRemainingDuration = remainingDuration - warmup.duration;
        }
        if (newRemainingDuration <= 15) {
            // add the warmup to the activity
            const finalResult = [];
            finalResult.push(warmup);
            finalResult.push(outing[0]);
            // return
            saveAndReturnOuting(req, res, finalResult, stepIds);
        } else {
            completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds, moneyToSpend);
        }
    });
};

export const fillBeforeMain = (req, res, outing, timeBeforeMain, stepIds, moneyToSpend) => {
    // get close by activity for warmup
    // TODO: change this to .5 once we populate warmups!
    let miles;
    if (req.query.radius) {
        miles = req.query.radius;
    } else {
        miles = 3;
    }
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
        warmup: 0,
        approved: 1,
        duration: timeBeforeMain,
        repeat_start: null,
        minPrice: { $lte: moneyToSpend },
    };

    const fillStepQuery = Step.find(query);

    if (req.query.active) {
        if (req.query.active === 0) {
            fillStepQuery.where('active', 0);
        }
    }

    // get all results, then index randomly into array
    fillStepQuery.exec((err, steps) => {
        const arrayLength = steps.length;
        const step = steps[Math.floor(Math.random() * arrayLength)];

        if (step.avgPrice <= moneyToSpend) {
            step.spend = step.avgPrice;
            moneyToSpend -= step.avgPrice;
        } else {
            // For now, just take the min price
            step.spend = step.minPrice;
            moneyToSpend -= step.minPrice;
        }

        // obj is the warmup activity; all warmups are 1 hour duration
        stepIds.push(step._id);

        const newRemainingDuration = req.query.duration - (timeBeforeMain + outing[0].duration);

        if (newRemainingDuration === 0) {
            // add the warmup to the activity
            const finalResult = [];
            finalResult.push(step);
            finalResult.push(outing[0]);
            // return
            saveAndReturnOuting(req, res, finalResult, stepIds);
        } else {
            completeOuting(req, res, step, outing, newRemainingDuration, stepIds, moneyToSpend);
        }
    });
};

/*
This function is passed an array of candidate steps for the outing's main step.
It searches this array for a step that is appropriate for the current time and
input duration.
*/
export const findMainStep = (steps, outingDuration, stepDuration, callback) => {
    // Go through steps until we find an acceptable one
    const arrayLength = steps.length;
    const stepIndex = Math.floor(Math.random() * arrayLength);
    const step = steps[stepIndex];
    // If not a recurring/time sensitive event
    if (!step.repeat_start) {
        callback(step);
    } else {
        // Step has a recurring time specification; calculate whether time is valid or not
        const date = new Date();
        const currentTimeInSeconds = Math.floor(date.getTime() / 1000);
        const repeatInterval = step.repeat_interval;
        const repeatIntervalSeconds = CONST[repeatInterval];

        const secondsBetween = currentTimeInSeconds - step.repeat_start;
        const leftoverSeconds = secondsBetween % repeatIntervalSeconds;

        let minutesUntilEvent;
        // if leftover seconds is negative, this just means it hasn't happened yet (ever), so need cases
        if (leftoverSeconds < 0) {
            minutesUntilEvent = leftoverSeconds / 60;
            minutesUntilEvent = minutesUntilEvent * -1;
        } else {
            const secondsUntilEvent = repeatIntervalSeconds - leftoverSeconds;
            minutesUntilEvent = secondsUntilEvent / 60;
        }
        const recalculatedSecondsUntilEvent = minutesUntilEvent * 60;

        // get end timestamp of outing
        const outingDurationSeconds = outingDuration * 3600;
        const stepDurationSeconds = stepDuration * 60;
        const outingEndTime = Math.floor(date.getTime() / 1000) + outingDurationSeconds;
        const stepEndTime = Math.floor(date.getTime() / 1000) + recalculatedSecondsUntilEvent + stepDurationSeconds;

        // TODO: Add in if it doesn't have an interval but just has a start time and end time
        // If the event is occurring in over 15 minutes AND will conclude before the end
        // of the outing, we can use it as our main event
        if (minutesUntilEvent > 15 && stepEndTime < outingEndTime) {
            step.timeSensitive = true;
            callback(step, minutesUntilEvent);
        } else {
            // Remove this step from candidate steps
            steps.splice(stepIndex, 1);
            if (steps.length === 0) {
                callback(null);
            } else {
                findMainStep(steps, outingDuration, stepDuration, callback);
            }
        }
    }
};

/*
This function is called when a user's next step is a time sensitive step that is beginning in less than
30 minutes. In this case, the user does not have enough time to partake in a traditional longer warmup, and
so is directed to just walk around the area as their "warmup" before the time sensitive event begins.
*/
export const exploreArea = (req, res, outing, minutesUntilEvent, stepDuration, stepIds, moneyToSpend) => {
    // TODO: add in location of first step here
    const exploreStep = {
        title: 'Explore the area!',
        description: `You\'re about to head to an awesome local event, but have some time to kill before it starts! Take the next ${minutesUntilEvent} minutes to explore the area around it.`,
        duration: minutesUntilEvent,
    };
    const newRemainingDurationMinutes = (req.query.duration * 60) - minutesUntilEvent - stepDuration;
    const leftoverMinutes = newRemainingDurationMinutes % 30;
    let newRemainingDurationRounded;
    // round to nearest half hour
    if (leftoverMinutes === 0) {
        newRemainingDurationRounded = newRemainingDurationMinutes;
    } else if (leftoverMinutes <= 15) {
        newRemainingDurationRounded = newRemainingDurationMinutes - leftoverMinutes;
    } else {
        newRemainingDurationRounded = newRemainingDurationMinutes + (30 - leftoverMinutes);
    }
    completeOuting(req, res, exploreStep, outing, newRemainingDurationRounded, stepIds, moneyToSpend);
};

/*
This function is called when an outing is requested. It pulls the MAIN outing event from the
database, which currently is calculated based on the input duration and location. The MAIN outing
event will take up at least half the time in the outing. It then calls getWarmup (if the duration
is not already filled) to continue to populate the outing.
*/
export const initiateOuting = (req, res) => {
    const duration = req.query.duration;
    const halfDuration = Math.ceil(duration / 2);
    const halfDurationMinutes = halfDuration * 60;
    const outing = [];
    const stepIds = [];

    let moneyToSpend;
    const price = req.query.price;
    if (req.query.price) {
        moneyToSpend = CONST[price];
    } else {
        moneyToSpend = CONST.ABOVE_50;
    }

    // If user has specified miles, account for them. Otherwise, assume everything should be in walking distance.
    // TODO: change walking distance radius to 1, once we have added enough activities.
    let miles;
    if (req.query.radius) {
        miles = req.query.radius;
    } else {
        miles = 3;
    }
    const radiusInRadians = miles / 3959;

    // Default initial location is the Green
    let initialLocationCoordinates;
    if (req.query.lat && req.query.lng) {
        initialLocationCoordinates = [req.query.lng, req.query.lat];
    } else {
        initialLocationCoordinates = [-72.288719, 43.705267];
    }

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [initialLocationCoordinates, radiusInRadians],
            },
        },
        warmup: 0,
        approved: 1,
        minPrice: { $lte: moneyToSpend },
    };
    const stepQuery = Step.find(query);

    // Activity level must not exceed walking if user specifies nonactive, and must include some activity if user specifies active.
    if (req.query.active) {
        if (req.query.active === 0) {
            stepQuery.where('active', 0);
        } else if (req.query.active === 1) {
            stepQuery.active = { $in: [0, 1] };
        } else {
            stepQuery.where('active').gt(1);
        }
    }

    let mainStepOptions;
    let mainStepDurationMinutes = halfDurationMinutes;

    // Find significant outing (i.e. at least half time of outing)
    async.whilst(
        function () { return mainStepOptions === undefined; },
        function (callback) {
            stepQuery.where('duration').eq(mainStepDurationMinutes);
            stepQuery.exec((err, steps) => {
                // If there's no step for the specified time, try 1 hour less for main step
                if (steps === undefined || steps.length === 0) {
                    mainStepDurationMinutes = mainStepDurationMinutes - 60;
                    // If we have checked for all active outings within time range, remove active specification and try to just
                    // find a normal outing; reset mainStepDurationMinutes
                    if (mainStepDurationMinutes === 0) {
                        if (req.query.active > 0) {
                            stepQuery.active = { $in: [0, 1, 2] };
                            req.query.active = 0;
                            mainStepDurationMinutes = halfDurationMinutes;
                        } else {
                            return res.status(400).send('No activities in your area yet :( Upload one today!');
                        }
                    }
                // Else, valid outing options were returned, so find an optimal one
                } else {
                    // Randomly pull outing from array
                    mainStepOptions = steps;
                    findMainStep(steps, req.query.duration, mainStepDurationMinutes, function(step, minutesUntilEvent) {
                        // Once we get the main step back, if step is null then no time sensitive step was appropriate for the given
                        // time window, so we must go through steps until we find an acceptable one
                        if (step === null) {
                            mainStepOptions = undefined;
                            mainStepDurationMinutes = mainStepDurationMinutes - 60;
                        } else {
                            if (step.avgPrice <= moneyToSpend) {
                                step.spend = step.avgPrice;
                                moneyToSpend -= step.avgPrice;
                            } else {
                                // For now, just take the min price
                                step.spend = step.minPrice;
                                moneyToSpend -= step.minPrice;
                            }
                            outing.push(step);
                            stepIds.push(step._id);
                            // If main event is a time sensitive event
                            if (minutesUntilEvent) {
                                // if time before event is less than 15 minutes, send user to event immediately but have them walk around a bit
                                // TODO: eventually account for driving time
                                if (minutesUntilEvent <= 30) {
                                    exploreArea(req, res, outing, minutesUntilEvent, step.duration, stepIds, moneyToSpend);
                                } else if (minutesUntilEvent <= 60) {
                                    // send user on warmup, warmup should take minutesUntilEvent time
                                    const newRemainingDurationMinutes = req.query.duration * 60 - step.duration;
                                    getWarmup(req, res, outing, newRemainingDurationMinutes, stepIds, moneyToSpend, minutesUntilEvent);
                                } else {
                                    // fill time before event with something larger
                                    const timeBeforeMain = Math.ceil(minutesUntilEvent / 60);
                                    fillBeforeMain(req, res, outing, timeBeforeMain, stepIds, moneyToSpend);
                                }
                            // Else, it's a non time sensitive event so just fill as we have been filling.
                            // Note: we'll eventually want to be more time sensitive anyway so this needs to be modified.
                            } else {
                                let newRemainingDuration = req.query.duration * 60 - step.duration;
                                if (newRemainingDuration === 0) {
                                    saveAndReturnOuting(req, res, outing, stepIds);
                                } else {
                                    // If step has a linked pre/post which fits within the outing, add this step
                                    if (step.linkedSteps[0] !== undefined) {
                                        // TODO: randomize
                                        const linkedStepCandidate = step.linkedSteps[0];
                                        const linkedStepCandidateDuration = linkedStepCandidate.duration;
                                        const linkedStepCandidatePrice = linkedStepCandidate.minPrice;

                                        // If linked step duration fits within the given timeframe and there is enough money for step, include linked step in the outing
                                        // TODO: check durationRange, not just avg Duration
                                        const checkDuration = newRemainingDuration - linkedStepCandidateDuration >= 0;
                                        const checkPrice = moneyToSpend - linkedStepCandidatePrice >= 0;
                                        if (checkDuration && checkPrice) {
                                            Step.findOne({ _id: linkedStepCandidate._id }).exec((err, linkedStep) => {
                                                if (err) {
                                                    return res.send();
                                                }
                                                linkedStep.spend = linkedStepCandidatePrice;
                                                linkedStep.duration = linkedStepCandidateDuration;
                                                outing.push(linkedStep);
                                                stepIds.push(linkedStep._id);
                                                outing[0].linkedPost = true;
                                                moneyToSpend -= linkedStepCandidatePrice;
                                                newRemainingDuration -= linkedStepCandidateDuration;

                                                if (newRemainingDuration === 0) {
                                                    saveAndReturnOuting(req, res, outing, stepIds);
                                                } else {
                                                    // TODO else call getWarmup
                                                    getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend);
                                                }
                                            });
                                        // Otherwise, the linked step doesn't work
                                        } else {
                                            getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend);
                                        }
                                    // Else, we don't need to worry about linked steps, so continue without them
                                    } else {
                                        getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend);
                                    }
                                }
                            }
                        }
                    });
                }
                callback(null, steps);
            });
        },
        function (err, results) {
            if (err || results === undefined || !results) {
                if (req.query.active) {
                    return res.status(404).send('Activities satisfying parameters not found in area; try removing active param?');
                } else if (req.query.radius) {
                    return res.status(404).send('Activities satisfying parameters not found in area; try increasing radius?');
                } else {
                    return res.status(404).send('Insufficient activities found in area; try lowering duration?');
                }
            }
        }
    );
};

/*
This function replaces the current outing with the generated step from skipStep,
removing the skipped step.
*/
export const updateOuting = (req, res, currentOuting, detailedSteps, replacedStep, newStep) => {
    const oldStepIds = currentOuting.stepIds;
    // Replace existing detailedSteps with new generated step
    const newOutingSteps = [];
    for (var i = 0; i < detailedSteps.length; i++) {
        const step = detailedSteps[i];
        if (step._id.toString() == replacedStep._id.toString()) {
            newOutingSteps.push(newStep);
        } else {
            newOutingSteps.push(step);
        }
    }

    // Replace existing stepIds with new generated step Id
    const newStepIds = [];
    for (var j = 0; j < oldStepIds.length; j++) {
        const stepId = oldStepIds[j];
        if (stepId.toString() == replacedStep._id.toString()) {
            newStepIds.push(newStep._id);
        } else {
            newStepIds.push(stepId);
        }
    }

    Outing.findOneAndUpdate(
        { _id: currentOuting._id },
        { $set: { detailedSteps: newOutingSteps, stepIds: newStepIds },
        },
        (err, user) => {
            if (err) {
                // TODO: update error
                return res.status(400).send('Error updating outing with new steps');
            }
        });
};

/*
This function gets data from a specific outing. It is used when the client clicks on an outing on their profile
to view the outing's specific details.
*/
export const getOutingData = (req, res) => {
    Outing.findOne({ _id: req.query.outingId }).exec((err, outing) => {
        if (err) {
            res.status(404).send('No such outing in DB; check outing ID');
        } else {
            res.json({
                outing,
            });
        }
    });
};

/*
This function queries the database for an alternate step in a generated outing. It returns an alternate step
if one is available and otherwise returns a 404.
*/
export const skipStep = (req, res) => {
    const offendingStepId = req.query.skip;
    const currentOutingId = req.query.outingId;

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

        // TODO: Change this to .5 once we have sufficient number of outings.
        const miles = 5;
        const radiusInRadians = miles / 3959;

        const query = {
            loc: {
                $geoWithin: {
                    $centerSphere: [offendingStep.loc.coordinates, radiusInRadians],
                },
            },
            _id: {
                $nin: currentOuting.stepIds,
            },
            duration: offendingStep.duration,
            approved: 1,
        };

        const skipStepQuery = Step.find(query);

        if (offendingStep.warmup === 1) {
            skipStepQuery.where('warmup', 1);
        } else {
            skipStepQuery.where('warmup', 0);
        }


        skipStepQuery.exec((err, steps) => {
            if (steps.length === 0) {
                return res.status(404).send('Alternate steps not found');
            }
            const arrayLength = steps.length;
            const newStep = steps[Math.floor(Math.random() * arrayLength)];

            updateOuting(req, res, currentOuting, currentOutingSteps, offendingStep, newStep);
            res.send(newStep);
        });
    });
};

/*
This function validates the request from the client and returns errors if any
parameters are incorrectly formatted or missing. If no errors, it calls initiateOuting.
*/
export const validateOutingRequest = (req, res) => {
    if (!req.query.duration) {
        return res.status(400).send('Duration not specified');
    } else if (req.query.duration % 1 !== 0) {
  //  } else if (req.query.duration > 6 || req.query.duration % 1 !== 0) {
        return res.status(400).send('Incorrect duration');
    } else {
        initiateOuting(req, res);
    }
};

/*
This function is first called when the outing endpoint is hit, handling the request according to
which parameters are specified.
*/
export const handleOutingRequest = (req, res) => {
    if (req.query.outingId && req.query.skip) {
        skipStep(req, res);
    } else if (req.query.outingId) {
        getOutingData(req, res);
    } else {
        validateOutingRequest(req, res);
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
