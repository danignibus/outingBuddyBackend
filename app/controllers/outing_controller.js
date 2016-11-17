// import consts from '../consts.js';
// import Routific  from 'routific';
import request from 'request';
import Outing from '../models/outing_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

export const createOuting = (req, res) => {
    const outing = new Outing();
    outing.title = 'hello!';
    outing.description = 'description';

    outing.save()
        .then(result => {
            console.log('outing created!');
        })
    .catch(error => {
        console.log('error');
    });
};

export const getOutings = (req, res) => {
    Outing.find({}, function(err,obj) { console.log(obj); });
};

export const getRandomOuting = (req, res) => {
    Outing
        .count()
        .exec((err, count) => {
            const skip = Math.floor(Math.random() * count);
            Outing.findOne().skip(skip).exec(function(err, obj) {
                if (err) {
                    return res.send();
                }
                res.json({ message: obj });
            });
        });
};

// function to optimize route using Routific API.
export const optimizeRouteRoutific = (req, res, outing) => {
    const data = {};
    const visits = {};

    data.visits = visits;

    for (let i = 0; i < outing.length; i++) {
        const stepLocation = {
            location: {
                name: outing[i].title,
                lat: outing[i].lat,
                lng: outing[i].lng,
            },
        };
        data.visits[outing[i]._id] = stepLocation;
    }

    data.fleet = {
        vehicle_1: {
            start_location: {
                id: 'initialLocation',
                name: 'Baker Berry',
                lat: 43.705267,
                lng: -72.288719,
            },
        },
    };

    const options = {
        url: 'https://api.routific.com/v1/vrp',
        json: data,
        headers: {
            Authorization: 'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ODFhNzI1NzUwY2MxMjUxN2QxZTcwZjgiLCJpYXQiOjE0NzgxMjgyMTV9.ejaVxuKZSuk54YWfeJ7s-s7hQz91ZTIc0ntt_M6irPY'
        },
    };
    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            const lookup = {};
            for (let j = 0; j < outing.length; j++) {
                lookup[outing[j]._id] = outing[j];
            }
            const finalResult = [];

            const solution = body.solution;
            const route = solution.vehicle_1;

            // NOTE: Starting at 1 because initial location is start location
            for (let k = 1; k < route.length; k++) {
                const nextId = route[k].location_id;
                finalResult.push(lookup[nextId]);
            }
            res.json({
                detailedSteps: finalResult,
            });
        }
        else {
            // ... Handle error
            console.log(response.statusCode + ': ' + body.error);
        }
    }
    request.post(options, callback);
};

// function to optimize route using RouteXL API.
export const optimizeRouteXL = (req, res, outing) => {
    const locations = [];

    const theGreen = {
        address: 'Green',
        lat: 43.705267,
        lng: -72.288719,
    };

    // Push start location as first calculated outing
    locations.push(theGreen);

    for (let i = 0; i < outing.length; i++) {
        const stepLocation = {
            address: outing[i].title,
            lat: `${outing[i].lat}`,
            lng: `${outing[i].lng}`,
        };
        locations.push(stepLocation);
    }


    // Push end location as phone's current location
    locations.push(theGreen);

    const auth = 'Basic ' + new Buffer(process.env.ROUTEXL_USERNAME + ':' + process.env.ROUTEXL_PASSWORD).toString('base64');

    const options = {
        url: 'https://api.routexl.nl/tour',
        form: { locations },
        headers: {
            Authorization: auth,
        },
    };

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            //create map
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

            // start at 1, end at length -1 to remove the Green from outing
            for (let k = 1; k < length - 1; k++) {
                const nextStepName = finalRoute[k].name;
                finalResult.push(lookup[nextStepName]);
            }

            res.json({
                detailedSteps: finalResult,
            });
        } else {
            // ... Handle error
            console.log(response.statusCode + ': ' + body.error);
        }
    }
    request.post(options, callback);
};

export const completeOuting = (req, res, outing, remainingDuration, stepIds) => {
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
        optimizeRouteXL(req, res, outing);
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
        };

        // TODO: find a different way to randomize where I don't have to pull twice
        Outing
            .find(query).where('duration').lte(remainingDuration).
            count().
            exec((err, count) => {
                const skip = Math.floor(Math.random() * count);
                Outing.findOne(query).where('duration').lte(remainingDuration).
                skip(skip)
                .exec(function(err, obj) {
                    outing.push(obj);
                    stepIds.push(obj._id);
                    const newRemainingDuration = remainingDuration - obj.duration;
                    completeOuting(req, res, outing, newRemainingDuration, stepIds);
                });
            });
    }
};

export const initiateOuting = (req, res) => {
    const duration = req.query.duration;

    // TODO: will need to change this when an activity doesn't have unlimited participants
    const halfDuration = Math.ceil(duration / 2);
    const outing = [];
    const stepIds = [];

    // find significant outing (i.e. at least half time of outing)
    Outing
        .find({ duration: halfDuration }).
        count().
        exec((err, count) => {
            const skip = Math.floor(Math.random() * count);
            Outing.findOne({ duration: halfDuration }).
            skip(skip)
            .exec(function(err, obj) {
                // getSecondStep(req, res, obj);
                outing.push(obj);
                stepIds.push(obj._id);
                const newRemainingDuration = req.query.duration - obj.duration;
                completeOuting(req, res, outing, newRemainingDuration, stepIds);
            });
        });
};

export const getRandomOutingStudy = (callback) => {
    Outing
        .count()
        .exec((err, count) => {
            const skip = Math.floor(Math.random() * count);
            Outing.findOne().skip(skip).exec(callback);
        });
};
