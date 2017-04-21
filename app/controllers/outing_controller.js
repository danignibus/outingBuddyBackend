// import consts from '../consts.js';
// import Routific  from 'routific';
import async from 'async';
import CONST from '../consts';
import nodemailer from 'nodemailer';
import request from 'request';

import Outing from '../models/outing_model';
import Route from '../models/route_model';
import Step from '../models/step_model';
import User from '../models/user_model';

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
    console.log('FINAL outing' + detailedSteps);
    let message = '';
    if (detailedSteps.message) {
        message = detailedSteps.message;
    }

    outing.detailedSteps = detailedSteps;
    outing.stepIds = stepIds;
    outing.userPhoneNumber = req.user.phoneNumber;

    // Email myself about the outing
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
        subject: 'Outing generated',
        text: `${req.user.name} generated a new outing! Here are the detailed steps: ${detailedSteps}. Here is the message (if applicable): ${message} Woohoo!`,
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info) {
        console.log('info' + info);
        if (error) {
            return console.log(error);
        }
    });
    outing.save()
        .then(result => {
            const userId = req.user._id;
            UserController.saveCurrentOutingProgress(res, userId, result._id, 0);
            UserController.inviteFriends(req, res, result._id);
            res.json({
                outingId: result._id,
                detailedSteps,
                message,
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
    if (warmup !== null) {
        finalResult.push(warmup);
    }
    if (outing.message !== null) {
        finalResult.message = outing.message;
    }
    finalResult.push(outing[0]); // main step
    let firstStep = outing[0];
    let hasLinkedPost = outing[0].linkedPost === true;
    let firstStepIndex = 0;
    // remove main step from the outing
    outing.splice(0, 1);

    if (outing[0] === undefined) {
        if (outing.reward === true) {
            // Push the Starbucks reward here
            Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                rewardStep.duration = 30;

                // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                finalResult.push(rewardStep);
                stepIds.push(rewardStep._id);
                saveAndReturnOuting(req, res, finalResult, stepIds);
            });
        } else {
            saveAndReturnOuting(req, res, finalResult, stepIds);
        }
    }

    // If we go directly from the main step to the final step, no need to calculate route
    else if (outing.length === 1) {
        finalResult.push(outing[0]);
        if (outing.reward === true) {
            // Push the Starbucks reward here
            Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                rewardStep.duration = 30;

                // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                finalResult.push(rewardStep);
                stepIds.push(rewardStep._id);
                saveAndReturnOuting(req, res, finalResult, stepIds);
            });
        } else {
            saveAndReturnOuting(req, res, finalResult, stepIds);
        }
    } else {
        const unsortedStepIds = stepIds.slice();
        let sortedStepIds = stepIds.slice();

        // Remove the warmup from sortedStepIds and unsortedStepIds. TODO: change if warmup comes later
        if (warmup !== null) {
            const warmupIndex = stepIds.indexOf(warmup._id);
            unsortedStepIds.splice(warmupIndex, 1);
            sortedStepIds.splice(warmupIndex, 1);
        }

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
                            outing.splice(minStepIndex, 1);
                            // TODO: I think below is a bug? Shouldn't it be setting firstStepIndex first
                            unsortedStepIds.splice(firstStepIndex, 1);
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

                        // // Notify myself!
                        // const transporter = nodemailer.createTransport('SMTP', {
                        //     service: 'Gmail',
                        //     auth: {
                        //         user: process.env.APP_EMAIL,
                        //         pass: process.env.APP_PASSWORD,
                        //     },
                        // });

                        // // email info
                        // const mailOptions = {
                        //     from: `"Outing Buddy App 👥" <${process.env.APP_EMAIL}>`, // sender address
                        //     to: `${process.env.APP_EMAIL}`,
                        //     subject: 'Previous route used!',
                        //     text: `Used a previous route! ${route[0].route} Woohoo!`,
                        // };

                        // // send mail with defined transport object
                        // transporter.sendMail(mailOptions, function(error, info) {
                        //     if (error) {
                        //         return console.log(error);
                        //     }
                        // });
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
                // Add reward at end of outing
                if (outing.reward === true) {
                    Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                        rewardStep.duration = 30;

                        // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                        finalResult.push(rewardStep);
                        stepIds.push(rewardStep._id);
                        saveAndReturnOuting(req, res, finalResult, stepIds);
                    });
                } else {
                    saveAndReturnOuting(req, res, finalResult, stepIds);
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
export const completeOuting = (req, res, warmup, outing, remainingDurationMinutes, stepIds, moneyToSpend, setDurationMinimum, nextStepStartTime) => {
    // get acceptable travel radius from client
    // must have enough populated outings for small radii to work!
    console.log('remaining duration minutes' + remainingDurationMinutes);
    console.log('next step start time' + nextStepStartTime);
    let miles;
    if (req.query.car === 'true') {
        miles = CONST.CAR_RADIUS;
    } else {
        miles = CONST.NO_CAR_RADIUS;
    }
    const radiusInRadians = miles / 3959;
    if (remainingDurationMinutes <= 15) {
        optimizeRoute(req, res, warmup, outing, stepIds);
    } else if (remainingDurationMinutes > 15) {
        const jsonObject = outing[0].toJSON();

        let acceptableDurationsCounter = remainingDurationMinutes;
        const acceptableDurations = [];
        let durationMinimum;
        // We don't want to send user on too many small tasks.
        if (setDurationMinimum) {
            if (remainingDurationMinutes > 60) {
                durationMinimum = 60;
            } else if (remainingDurationMinutes > 30) {
                durationMinimum = 30;
            } else {
                durationMinimum = 0;
            }
        } else {
            durationMinimum = 0;
        }

        while (acceptableDurationsCounter > durationMinimum) {
            acceptableDurations.push(acceptableDurationsCounter);
            acceptableDurationsCounter -= 15;
        }
        let excludedIds;
        if (req.query.completedSteps !== undefined) {
            excludedIds = req.query.completedSteps.concat(stepIds);
        } else {
            excludedIds = stepIds;
        }

        const activeLevels = [];
        if (req.query.active) {
            console.log(req.query.active);
            if (req.query.active === '0') {
                activeLevels.push(0);
            // Else, request is either for a level 1 active event OR main step fulfilled active requirement, so
            // query for steps that are less active
            } else if (req.query.active === '1' || req.query.active === '2' || req.query.active === '3') {
                activeLevels.push(0);
                activeLevels.push(1);
            // Else, main step did not fill "active" requirement, so push higher levels for completing steps
            } else if (req.query.active === '4') {
                activeLevels.push(2);
                activeLevels.push(3);
                // Set req.query.active to lower number so that it will only pull one harder active step
                req.query.active === '3';
            }
        }
        console.log('duration minimum' + durationMinimum);
        console.log('active levels' + activeLevels);
        console.log('acceptable durations' + acceptableDurations);

        const currentTime = new Date();
        let currentDay = currentTime.getDay();
        currentDay = currentDay + 1;

        // query for steps within a given radius and that have not already been added to the outing
        const query = {
            _id: {
                $nin: excludedIds,
            },
            active: { $in: activeLevels },
            approved: 1,
            durationRange: { $in: acceptableDurations },
            loc: {
                $geoWithin: {
                    $centerSphere: [jsonObject.loc.coordinates, radiusInRadians],
                },
            },
            minPrice: { $lte: moneyToSpend },
            repeat_start: null,
            warmup: 0,
            openDays: currentDay,
        };

        // Guidance from http://stackoverflow.com/questions/43163264/set-mongoose-query-condition-based-on-document-s-attribute/43164265#43164265
        // TODO: test that this actually works w/ appropriate time tests
        Step.aggregate([
            { $match: query },
            { $project: {
                active: 1,
                approved: 1,
                author: 1,
                avgPrice: 1,
                closeTime2: 1,
                description: 1,
                duration: 1,
                durationRange: 1,
                image: 1,
                linkedPost: 1,
                linkedPostId: 1,
                linkedSteps: 1,
                loc: 1,
                maxPrice: 1,
                minPrice: 1,
                minDuration: 1,
                openTime2: 1,
                repeat_interval: 1,
                repeat_start: 1,
                title: 1,
                participants: 1,
                spend: 1,
                warmup: 1,
                matches:
                { $cond: [{ $and: [
                        { $lte: ['$openTime2', nextStepStartTime] },
                        { $gte: ['$closeTime2', { $add: [nextStepStartTime, '$minDuration'] },
                        ] },
                ] }, 1, 0] } } },
            { $match: { matches: 1 } }],
            function (err, steps) {
                if (steps === undefined || steps.length === 0) {
                    if (durationMinimum > 0) {
                        // remove the durationMinimum and query again
                        completeOuting(req, res, warmup, outing, remainingDurationMinutes, stepIds, moneyToSpend, false, nextStepStartTime);
                    } else if (remainingDurationMinutes <= 30) {
                        // Most of the outing has been filled, so just return as-is
                        completeOuting(req, res, warmup, outing, 0, stepIds, moneyToSpend, false, nextStepStartTime);
                    } else {
                        outing.message = 'NOT_FULL';
                        optimizeRoute(req, res, warmup, outing, stepIds);
                        // return res.status(404).send('Insufficient activities found in area to fill the outing; try lowering duration or increasing price?');
                    }
                } else {
                    const arrayLength = steps.length;
                    // Grab random step from list
                    const step = steps[Math.floor(Math.random() * arrayLength)];

                    const availableDuration = step.durationRange;
                    console.log('step added in completeOuting' + step.title);

                    // Determine time to be spent on specific step.
                    // Start with the middle point of all available durations for the step
                    // Work downwards until finding a match
                    let midpointIndex = Math.round((availableDuration.length - 1) / 2);
                    // If the midpoint of available duration is less than the smallest acceptable duration,
                    // start at the end of array instead
                    if (availableDuration[midpointIndex] < acceptableDurations[acceptableDurations.length - 1]) {
                        midpointIndex = availableDuration.length - 1;
                    }

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
                    console.log('new remaining duration' + newRemainingDuration);
                    let followingStepStartTime = nextStepStartTime + step.duration;
                    if (followingStepStartTime >= 1440) {
                        followingStepStartTime = followingStepStartTime - 1440;
                    }
                    completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds, moneyToSpend, true, followingStepStartTime);
                }
            }
        );
    }
};

/*
This function pulls a warmup (flagged as a 1 in the warmup field) from the database that is
within a close range to the main activity of the outing. When the outing is fully generated, the
user is sent on this warmup prior to the rest of the steps in the outing.
*/
export const getWarmup = (req, res, outing, remainingDuration, stepIds, moneyToSpend, warmupLength, nextStepStartTime) => {
    // get close by activity for warmup
    // TODO: change this to .5 once we populate warmups!
    console.log('remaining duration at warmup is ' + remainingDuration);
    const miles = 4;
    const radiusInRadians = miles / 3959;
    const jsonObject = outing[0].toJSON();

    const midnightTime = new Date();
    const currentTime = new Date(midnightTime);
    // From stackoverflow: http://stackoverflow.com/questions/10944396/how-to-calculate-ms-since-midnight-in-javascript
    const millisecondsSinceMidnight = currentTime - midnightTime.setHours(0, 0, 0, 0);
    const secondsSinceMidnight = millisecondsSinceMidnight / 1000;
    const minutesSinceMidnight = secondsSinceMidnight / 60;

    let currentDay = currentTime.getDay();
    // Days are stored with values 1-7 in DB for readability; getDay returns values from 0-6
    currentDay = currentDay + 1;

    let excludedIds;
    if (req.query.completedSteps !== undefined) {
        excludedIds = req.query.completedSteps.concat(stepIds);
    } else {
        excludedIds = stepIds;
    }

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [jsonObject.loc.coordinates, radiusInRadians],
            },
        },
        _id: {
            $nin: excludedIds,
        },
        warmup: 1,
        approved: 1,
        closeTime2: { $gte: minutesSinceMidnight },
        repeat_start: null,
        minPrice: { $lte: moneyToSpend },
        openTime2: { $lte: minutesSinceMidnight },
        openDays: currentDay,
    };

    const warmupQuery = Step.find(query);
    if (req.query.active) {
        if (req.query.active === '0' || req.query.active === '1') {
            warmupQuery.where('active', 0);
        } else {
            console.log(req.query.active);
            // Else, get the generic 'active' warmup
            warmupQuery.where('active', 2);
        }
    }

    // get all results, then index randomly into array
    warmupQuery.exec((err, steps) => {
        let warmup;
        if (steps === undefined || steps.length === 0) {
            // return res.status(404).send('There are no warmups in this area :(');
            console.log('got warmups are undefined');
            warmup = null;
        } else {
            const arrayLength = steps.length;
            warmup = steps[Math.floor(Math.random() * arrayLength)];

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
        }

        let newRemainingDuration;
        // If minutes until event have been specified
        if (warmupLength && warmup !== null) {
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
        } else if (warmup !== null) {
            newRemainingDuration = remainingDuration - warmup.duration;
        } else {
            newRemainingDuration = remainingDuration;
        }
        console.log(warmup);

        if (newRemainingDuration <= 15) {
            // add the warmup to the activity
            const finalResult = [];
            finalResult.push(warmup);
            finalResult.push(outing[0]);
            // return
            if (outing.reward === true) {
                // Add the reward step to the outing
                Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                    if (err) {
                        return res.send();
                    }
                    rewardStep.duration = 30;

                    // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                    finalResult.push(rewardStep);
                    stepIds.push(rewardStep._id);
                    saveAndReturnOuting(req, res, finalResult, stepIds);
                });
            } else {
                saveAndReturnOuting(req, res, finalResult, stepIds);
            }
        } else {
            completeOuting(req, res, warmup, outing, newRemainingDuration, stepIds, moneyToSpend, true, nextStepStartTime);
        }
    });
};

export const fillBeforeMain = (req, res, outing, timeBeforeMain, stepIds, moneyToSpend) => {
    // get close by activity for warmup
    // TODO: change this to .5 once we populate warmups!
    let miles;
    if (req.query.car === 'true') {
        miles = CONST.CAR_RADIUS;
    } else {
        miles = CONST.NO_CAR_RADIUS;
    }
    const radiusInRadians = miles / 3959;
    const jsonObject = outing[0].toJSON();

    let excludedIds;
    if (req.query.completedSteps !== undefined) {
        excludedIds = req.query.completedSteps.concat(stepIds);
    } else {
        excludedIds = stepIds;
    }

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [jsonObject.loc.coordinates, radiusInRadians],
            },
        },
        _id: {
            $nin: excludedIds,
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
            completeOuting(req, res, step, outing, newRemainingDuration, stepIds, moneyToSpend, true);
        }
    });
};

/*
This function is passed an array of candidate steps for the outing's main step.
It searches this array for a step that is appropriate for the current time and
input duration.
*/
export const findMainStep = (steps, outingDuration, stepDuration, mainStepStartTime, car, callback) => {
    // Go through steps until we find an acceptable one
    const arrayLength = steps.length;
    let stepIndex;
    let step;

    // If user has a car, randomly pull step that is further away
    if (car === 'true') {
        const halfStepsArray = Math.floor(arrayLength / 2);
        // Start number should be at second half of array
        // From stackoverflow: http://stackoverflow.com/questions/4959975/generate-random-number-between-two-numbers-in-javascript
        const lastArrayIndex = arrayLength - 1;
        stepIndex = Math.floor(Math.random() * (lastArrayIndex - halfStepsArray + 1) + halfStepsArray);
        step = steps[stepIndex];
        console.log('arrayLength' + arrayLength);
        console.log('step index for car' + stepIndex);
    } else {
        stepIndex = Math.floor(Math.random() * arrayLength);
        step = steps[stepIndex];
    }
    // If not a recurring/set start time event
    if (!step.repeat_start) {
        if (step.closeTime2 >= mainStepStartTime + step.minDuration) {
            console.log('step close time was >= main step start time plus minDuration');
            callback(step);
        } else {
            steps.splice(stepIndex, 1);
            if (steps.length === 0) {
                callback(null);
            } else {
                findMainStep(steps, outingDuration, stepDuration, mainStepStartTime, car, callback);
            }
        }
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
                findMainStep(steps, outingDuration, stepDuration, mainStepStartTime, car, callback);
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
    completeOuting(req, res, exploreStep, outing, newRemainingDurationRounded, stepIds, moneyToSpend, true);
};

/*
This function is called when an outing is requested. It pulls the MAIN outing event from the
database, which currently is calculated based on the input duration and location. The MAIN outing
event will take up at least half the time in the outing. It then calls getWarmup (if the duration
is not already filled) to continue to populate the outing.
*/
export const initiateOuting = (req, res) => {
    const outing = [];
    if (req.user.rewardStudy === true) {
        outing.reward = true;
    } else {
        outing.reward = false;
    }

    let duration = req.query.duration;
    // Leave 30 mins at end for Starbucks
    if (outing.reward === true) {
        duration = req.query.duration - .5;
    }
    // Note: removed Math.ceil to hopefully accommodate more steps
    const halfDuration = duration / 2;
    console.log('half duration' + halfDuration);

    const halfDurationMinutes = halfDuration * 60;
    const stepIds = [];

    const midnightTime = new Date();
    const currentTime = new Date(midnightTime);
    // From stackoverflow: http://stackoverflow.com/questions/10944396/how-to-calculate-ms-since-midnight-in-javascript
    const millisecondsSinceMidnight = currentTime - midnightTime.setHours(0, 0, 0, 0);
    const secondsSinceMidnight = millisecondsSinceMidnight / 1000;
    const minutesSinceMidnight = secondsSinceMidnight / 60;
    console.log('minutes since midnight' + minutesSinceMidnight);

    let currentDay = currentTime.getDay();

    // Days are stored with values 1-7 in DB for readability; getDay returns values from 0-6
    currentDay = currentDay + 1;

    let moneyToSpend;
    const price = req.query.price;
    if (req.query.price) {
        moneyToSpend = CONST[price];
    } else {
        moneyToSpend = CONST.ABOVE_50;
    }

    // If user has specified that they have a car, account for this. Otherwise, assume everything should be in walking distance.
    // TODO: change walking distance radius to 1, once we have added enough activities.
    let miles;
    if (req.query.car === 'true') {
        miles = CONST.CAR_RADIUS;
    } else {
        miles = CONST.NO_CAR_RADIUS;
    }
    const radiusInRadians = miles / 3959;

    // Default initial location is the Green
    let initialLocationCoordinates;
    if (req.query.lat && req.query.lng) {
        initialLocationCoordinates = [req.query.lng, req.query.lat];
    } else {
        initialLocationCoordinates = [-72.288719, 43.705267];
    }

    const activeLevels = [];
    // Activity level must not exceed walking if user specifies nonactive, and must include some activity if user specifies active.
    if (req.query.active) {
        if (req.query.active === '0') {
            activeLevels.push(0);
        } else if (req.query.active === '1') {
            activeLevels.push(0);
            activeLevels.push(1);
        } else {
            activeLevels.push(2);
            activeLevels.push(3);
        }
    // Else, level of activity has not been specified, so all levels of activity are valid
    } else {
        activeLevels.push(0);
        activeLevels.push(1);
        activeLevels.push(2);
        activeLevels.push(3);
    }

    const query = {
        active: { $in: activeLevels },
        approved: 1,
        closeTime2: { $gte: minutesSinceMidnight },
        loc: {
            $geoWithin: {
                $centerSphere: [initialLocationCoordinates, radiusInRadians],
            },
        },
        minPrice: { $lte: moneyToSpend },
        openDays: currentDay,
        openTime2: { $lte: minutesSinceMidnight },
        warmup: 0,
    };

    // TODO: need to figure out how to make closeTime gte currentTimeInteger + duration
    const stepQuery = Step.find(query);

    let mainStepOptions;
    let mainStepDurationMinutes = halfDurationMinutes;

    // Find significant outing (i.e. at least half time of outing)
    async.whilst(
        function () { return mainStepOptions === undefined; },
        function (callback) {
            const acceptableDurations = [];
            let mainStepDurationMinutesCounter = mainStepDurationMinutes;
            if (mainStepDurationMinutesCounter < 0) {
                acceptableDurations.push(0);
            } else {
                while (mainStepDurationMinutesCounter <= duration * 60) {
                    acceptableDurations.push(mainStepDurationMinutesCounter);
                    mainStepDurationMinutesCounter += 15;
                }
            }
            console.log('acceptable durations' + acceptableDurations);
            stepQuery.where('durationRange', { $in: acceptableDurations });
            stepQuery.exec((err, steps) => {
                console.log('received potential main steps:');
                for (let step in steps) {
                    console.log(steps[step].title);
                }
                // If there's no step for the specified time, try 1 hour less for main step
                if (steps === undefined || steps.length === 0) {
                    mainStepDurationMinutes = mainStepDurationMinutes - 60;

                    // If we have checked for all active outings within time range, remove active specification and try to just
                    // find a normal outing; reset mainStepDurationMinutes
                    if (mainStepDurationMinutes <= 0) {
                        if (req.query.active > 1 && req.query.active < 4) {
                            stepQuery.where('active').in([0, 1, 2]);
                            // Set req.query.active to 4 to indicate that we initially had an active outing, but weren't able
                            // to fill the main step as an active step so now need to find an active step to complete the outing
                            req.query.active = '4';
                            mainStepDurationMinutes = halfDurationMinutes;
                        } else {
                            return res.status(400).send('No activities with these parameters at the current time :( Upload one today!');
                        }
                    }
                // Else, valid outing options were returned, so find an optimal one
                } else {
                    // Randomly pull outing from array
                    mainStepOptions = steps;
                    findMainStep(steps, duration, mainStepDurationMinutes, minutesSinceMidnight, req.query.car, function(step, minutesUntilEvent) {
                        // Once we get the main step back, if step is null then no time sensitive step was appropriate for the given
                        // time window, so we must continuously try to find a main step until success
                        if (step === null) {
                            console.log('got in here');
                            mainStepOptions = undefined;
                            mainStepDurationMinutes = mainStepDurationMinutes - 60;
                        // Otherwise, if step is not null, we calculate the budget and set duration for the step and add it to the outing
                        } else {
                            console.log('MAIN STEP ' + step.title);
                            if (step.avgPrice <= moneyToSpend) {
                                step.spend = step.avgPrice;
                                moneyToSpend -= step.avgPrice;
                            } else {
                                // For now, just take the min price
                                step.spend = step.minPrice;
                                moneyToSpend -= step.minPrice;
                            }
                            // If half the outing is just 15 mins, make the main step take up more time
                            if (mainStepDurationMinutes === 15) {
                                step.duration = 30;
                            } else {
                                step.duration = mainStepDurationMinutes;
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
                                    const newRemainingDurationMinutes = duration * 60 - step.duration;
                                    getWarmup(req, res, outing, newRemainingDurationMinutes, stepIds, moneyToSpend, minutesUntilEvent);
                                } else {
                                    // fill time before event with something larger
                                    const timeBeforeMain = Math.ceil(minutesUntilEvent / 60);
                                    fillBeforeMain(req, res, outing, timeBeforeMain, stepIds, moneyToSpend);
                                }
                            // Else, it's a non time sensitive event so just fill as we have been filling.
                            // Note: we'll eventually want to be more time sensitive anyway so this needs to be modified.
                            } else {
                                let newRemainingDuration = duration * 60 - step.duration;
                                if (newRemainingDuration === 0) {
                                    if (outing.reward === true) {
                                        // Add the reward step to the outing
                                        Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                                            if (err) {
                                                return res.send();
                                            }
                                            rewardStep.duration = 30;

                                            // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                                            outing.push(rewardStep);
                                            stepIds.push(rewardStep._id);
                                            saveAndReturnOuting(req, res, outing, stepIds);
                                        });
                                    } else {
                                        saveAndReturnOuting(req, res, outing, stepIds);
                                    }
                                } else {
                                    // If step has a linked pre/post which fits within the outing, add this step
                                    if (step.linkedSteps[0] !== undefined && step.linkedSteps[0].score >= 3) {
                                        // TODO: randomize
                                        const linkedStepCandidate = step.linkedSteps[0];
                                        // Linked step will begin directly after main step
                                        const linkedStepStartTime = minutesSinceMidnight + step.duration;
                                        const linkedStepCandidateDuration = linkedStepCandidate.duration;
                                        const linkedStepCandidatePrice = linkedStepCandidate.minPrice;
                                        const linkedStepCandidateOpenTime = linkedStepCandidate.openTime;
                                        const linkedStepCandidateClosedTime = linkedStepCandidate.closeTime;

                                        // If linked step duration fits within the given timeframe and there is enough money for step, include linked step in the outing
                                        // TODO: check durationRange, not just avg Duration
                                        const checkDuration = newRemainingDuration - linkedStepCandidateDuration >= 0;
                                        const checkPrice = moneyToSpend - linkedStepCandidatePrice >= 0;
                                        const checkStartTime = linkedStepStartTime >= linkedStepCandidateOpenTime;
                                        const checkEndTime = linkedStepStartTime + linkedStepCandidateDuration <= linkedStepCandidateClosedTime;

                                        if (checkDuration && checkPrice && checkStartTime && checkEndTime) {
                                            Step.findOne({ _id: linkedStepCandidate._id }).exec((err, linkedStep) => {
                                                if (err) {
                                                    return res.send();
                                                }

                                                // Set the step's budget and duration to the calculated budget and duration
                                                linkedStep.spend = linkedStepCandidatePrice;
                                                linkedStep.duration = linkedStepCandidateDuration;

                                                // Add the linked step to the outing directly after the main step (i.e., the one it is linked to)
                                                outing.push(linkedStep);
                                                stepIds.push(linkedStep._id);
                                                outing[0].linkedPost = true;
                                                outing[0].linkedPostId = linkedStep._id;

                                                // Update total money, overall duration attributes accordingly
                                                moneyToSpend -= linkedStepCandidatePrice;
                                                newRemainingDuration -= linkedStepCandidateDuration;

                                                if (newRemainingDuration === 0) {
                                                    if (outing.reward === true) {
                                                        // Add the reward step to the outing
                                                        Step.findOne({ _id: process.env.REWARD_STEP_ID }).exec((err, rewardStep) => {
                                                            rewardStep.duration = 30;

                                                            // Add the reward step to the outing directly after the main step (i.e., the one it is linked to)
                                                            outing.push(rewardStep);
                                                            stepIds.push(rewardStep._id);
                                                            saveAndReturnOuting(req, res, outing, stepIds);
                                                        });
                                                    } else {
                                                        saveAndReturnOuting(req, res, outing, stepIds);
                                                    }
                                                } else {
                                                    let nextStepStartTime = linkedStepStartTime + linkedStepCandidateDuration;
                                                    if (nextStepStartTime >= 1440) {
                                                        nextStepStartTime = nextStepStartTime - 1440;
                                                    }
                                                    if (req.query.active > 1 || (req.query.duration > 3 && req.query.car !== true)) {
                                                        getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend, null, nextStepStartTime);
                                                    } else {
                                                        completeOuting(req, res, null, outing, newRemainingDuration, stepIds, moneyToSpend, true, nextStepStartTime);
                                                    }
                                                }
                                            });
                                        // Otherwise, the linked step doesn't fit within this outing, so we should just grab another random step
                                        // from the database
                                        } else {
                                            // The next step's start time will be the end time of the main step
                                            let nextStepStartTime = minutesSinceMidnight + step.duration;
                                            if (nextStepStartTime >= 1440) {
                                                nextStepStartTime = nextStepStartTime - 1440;
                                            }
                                            if (req.query.active > 1 || (req.query.duration > 3 && req.query.car !== true)) {
                                                getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend, null, nextStepStartTime);
                                            } else {
                                                completeOuting(req, res, null, outing, newRemainingDuration, stepIds, moneyToSpend, true, nextStepStartTime);
                                            }
                                        }
                                    // Else, we don't need to worry about linked steps, so continue without them
                                    } else {
                                        let nextStepStartTime = minutesSinceMidnight + step.duration;
                                        if (nextStepStartTime >= 1440) {
                                            nextStepStartTime = nextStepStartTime - 1440;
                                        }
                                        if (req.query.active > 1 || (req.query.duration > 3 && req.query.car !== true)) {
                                            getWarmup(req, res, outing, newRemainingDuration, stepIds, moneyToSpend, null, nextStepStartTime);
                                        } else {
                                            completeOuting(req, res, null, outing, newRemainingDuration, stepIds, moneyToSpend, true, nextStepStartTime);
                                        }
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
                } else if (req.query.car === 'false') {
                    return res.status(404).send('Activities satisfying parameters not found in area; try obtaining car?');
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
        const miles = 4;
        const radiusInRadians = miles / 3959;

        const midnightTime = new Date();
        const currentTime = new Date(midnightTime);
        // From stackoverflow: http://stackoverflow.com/questions/10944396/how-to-calculate-ms-since-midnight-in-javascript
        const millisecondsSinceMidnight = currentTime - midnightTime.setHours(0, 0, 0, 0);
        const secondsSinceMidnight = millisecondsSinceMidnight / 1000;
        const minutesSinceMidnight = secondsSinceMidnight / 60;

        let currentDay = currentTime.getDay();
        currentDay = currentDay + 1;

        const query = {
            approved: 1,
            loc: {
                $geoWithin: {
                    $centerSphere: [offendingStep.loc.coordinates, radiusInRadians],
                },
            },
            _id: {
                $nin: currentOuting.stepIds,
            },
            durationRange: offendingStep.duration,
            openDays: currentDay,
            openTime2: { $lte: minutesSinceMidnight },
            closeTime2: { $gte: minutesSinceMidnight },
        };

        const skipStepQuery = Step.find(query);

        if (offendingStep.warmup === 1) {
            skipStepQuery.where('warmup', 1);
        } else {
            skipStepQuery.where('warmup', 0);
        }


        skipStepQuery.exec((err, steps) => {
            if (steps === undefined || steps.length === 0) {
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
        if (process.env.NO_REPEAT_STEPS === 'true') {
            // Get list of past steps that user has participated in
            User.findOne({ _id: req.user._id }).exec((err, user) => {
                req.query.completedSteps = user.completedSteps;
                initiateOuting(req, res);
            });
        } else {
            initiateOuting(req, res);
        }
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
