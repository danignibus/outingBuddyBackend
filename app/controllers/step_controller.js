import Step from '../models/step_model';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

const fileSystem = require('fs');
dotenv.config({ silent: true });

/*
This function receives data from the client for a step submitted by a user,
and stores this step in the Mongo database.
*/
export const createStep = (req, res, callback) => {
    const step = new Step();

    step.active = req.query.active || 0;
    step.author = req.user._id;
    step.avgPrice = req.query.avgPrice;
    step.description = req.query.description;
    step.duration = req.query.duration;
    step.image = req.query.image;
    step.loc.coordinates = [req.query.lng, req.query.lat];
    step.loc.type = 'Point';
    step.maxPrice = req.query.maxPrice;
    step.minPrice = req.query.minPrice;
    step.participants = req.query.participants || 'UNLIMITED';
    step.title = req.query.title;
    step.warmup = req.query.warmup || 0;
    step.approved = 0;

    step.save()
        .then(result => {
            if (!req.query.isLinkedStep) {
                res.send(result);
            } else {
                callback(result);
            }
        })
    .catch(error => {
        res.send(error);
    });

    // following is from nodemailer documentation

    // using SMTP transport
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
        subject: 'New step submission',
        text: `Got a new step! 🐴🐴🐴 Title: ${step.title}. Description: ${step.description}. Duration: ${step.duration}. Coordinates: ${step.loc.coordinates}. Active: ${step.active}. Author: ${req.user.name}. Warmup: ${step.warmup}. Image: ${step.image}. Linked steps: ${step.linkedSteps}. Prices: ${step.avgPrice}. ${step.maxPrice}. ${step.minPrice}.`,
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info){
        if (error) {
            return console.log(error);
        }
    });
};

/*
This function adds a linked step to a step which already exists in the database. It either creates
the linked step if this step does not already exist, or sets the linked step equivalent to a current
step within the database.
*/
export const addLinkedStep = (req, res) => {
    const mainStep = req.query.stepId;

    // If step has been already created
    if (req.query.linkedStepId) {
        // get the linked step from DB, add with a score of 5 and total scorers 1 (since presumably, the person adding this step as a linked step
        // thinks the two are paired well)
        Step.findOne({ _id: req.query.linkedStepId }).exec((err, linkedStep) => {
            const linkedStepToAdd = {
                _id: req.query.linkedStepId,
                avgPrice: linkedStep.avgPrice,
                duration: linkedStep.duration,
                minPrice: linkedStep.minPrice,
                order: req.query.linkedStepOrder,
                score: 5,
                totalScores: 1,
            };

            // Get the main step, and add this linkedStep to the main
            Step.findOneAndUpdate(
                { _id: mainStep },
                { $push: {
                    linkedSteps: {
                        $each: [linkedStepToAdd],
                        $sort: { score: -1 },
                    },
                },
            },
                (err, step) => {
                    if (err) {
                        console.log('Error adding linkedStep');
                    } else {
                        res.send(step);
                    }
                }
            );
        });

    // Else, linked step is also a new step.
    } else {
        createStep(req, res, function (resultingStep) {
            const linkedStep = {
                _id: resultingStep._id,
                avgPrice: resultingStep.avgPrice,
                duration: resultingStep.duration,
                minPrice: resultingStep.minPrice,
                order: req.query.linkedStepOrder,
                score: 5,
                totalScores: 1,
            };

            // Add linked Steps, sort by descending
            Step.findOneAndUpdate(
                { _id: mainStep },
                {
                    $push: {
                        linkedSteps: {
                            $each: [linkedStep],
                            $sort: { score: -1 },
                        },
                    },
                },
                    (err, step) => {
                        if (err) {
                            console.log('Error adding linkedStep');
                        } else {
                            return res.send(step);
                        }
                    }
            );
        });
    }
};

/*
This function searches for major words within the given title for a new step for
steps that are available within the specified area.
*/
export const searchStep = (req, res) => {
    if (! req.query.title) {
        res.status(404).send('Title of step to search not specified');
    } else if (! req.query.lat || !req.query.lng) {
        res.status(404).send('Lat or lng of step to search not specified');
    }
    const submittedTitle = req.query.title;
    const submittedCoordinates = [req.query.lng, req.query.lat];
    const appRoot = process.cwd();
    // Get all stopWords, read into an array
    // Source: http://www.lextek.com/manuals/onix/stopwords1.html
    const data = fileSystem.readFileSync(`${appRoot}/app/stopWords.txt`).toString().split('\n');

    const splitTitle = submittedTitle.match(/[^\s]+|\s+[^\s+]$/g);
    const wordsToSearch = [];
    for (const word in splitTitle) {
        // Need to trim word
        const trimmed = splitTitle[word].toLowerCase();
        if (data.indexOf(trimmed) === -1) {
            wordsToSearch.push(trimmed);
        }
    }
    let searchString = '';
    for (const searchWord in wordsToSearch) {
        searchString += `${wordsToSearch[searchWord]} `;
    }

    const miles = 2;
    const radiusInRadians = miles / 3959;

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [submittedCoordinates, radiusInRadians],
            },
        },
        $text: { $search: searchString, $caseSensitive: false },
    };

    Step.find(query)
       .limit(5)
       .exec(function(err, steps) {
            res.send(steps);
       });
};

/*
Given the coordinates of a step that has just been created, returns the names and IDs of candidate related linked post
steps within 2 miles which may be appropriate to add to the step.
*/
export const getCandidateLinkedPosts = (req, res) => {
    if (! req.query.lat || !req.query.lng) {
        res.status(404).send('Lat or lng of step to search not specified');
    }
    const submittedCoordinates = [req.query.lng, req.query.lat];

    const miles = 2;
    const radiusInRadians = miles / 3959;

    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [submittedCoordinates, radiusInRadians],
            },
        },
    };

    Step.find(query)
       .limit(5)
       .exec(function(err, steps) {
            res.send(steps);
       });
};

/*
This function updates any edges between steps and linked steps within an outing based on the rating given to the overall outing
by the user.
*/
export const updateLinkedSteps = (rating, outing) => {
    // Loop through each step in outing and check whether it has a linkedPost
    for (var i = 0; i < outing.detailedSteps.length; i++) {
        // If a specific step in the outing had a linked post step associated with it, we want to update the edge's score between these two steps
        if (outing.detailedSteps[i].linkedPost === true) {
            console.log(outing.detailedSteps[i]);
            const linkedPostId = outing.detailedSteps[i].linkedPostId;
            // Get this linkedStep subdocument from within the main step's document
            const linkedSteps = outing.detailedSteps[i].linkedSteps;

            // perform fresh query on that linkedPostId (since it might have changed due to other users over the course of the outing)
            Step.findOne({ _id: outing.detailedSteps[i]._id }, function(err, step) {
                // Calculate new average score
                const linkedStep = step.linkedSteps.id(linkedPostId);
                const currentTotalScores = linkedStep.totalScores;
                const currentScore = linkedStep.score;
                const newAverageNumerator = parseInt(currentScore) * parseInt(currentTotalScores) + parseInt(rating);
                const newAverageDenominator = parseInt(currentTotalScores) + 1;
                const newAverageScore = newAverageNumerator * 1.0 / newAverageDenominator;

                // Update linked step to have this score in DB
                linkedStep.score = newAverageScore;
                linkedStep.totalScores = currentTotalScores + 1;
                step.save(function (err, result) {
                    console.log('Updated linked step rating');
                });
            });
        }
    }
};

/*
This function handles a step POST based on whether it is a submission for a linked step or a normal step.
*/
export const submitStep = (req, res) => {
    // If step is a linked step
    if (req.query.isLinkedStep) {
        addLinkedStep(req, res);
    } else {
        createStep(req, res);
    }
};

/*
This function handles a step GET based on whether client is checking for duplicate steps or querying for potential
linked post steps.
*/
export const getPotentialSteps = (req, res) => {
    if (req.query.getPotentialDuplicates) {
        searchStep(req, res);
    } else if (req.query.getPotentialLinkedSteps) {
        getCandidateLinkedPosts(req, res);
    } else {
        res.status(404).send('Must specify whether getting potential duplicates or getting potential linked steps; refer to documentation');
    }
};
