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
        // get the linked step from DB
        Step.findOne({ _id: req.query.linkedStepId }).exec((err, linkedStep) => {
            const linkedStepToAdd = {
                _id: req.query.linkedStepId,
                avgPrice: linkedStep.avgPrice,
                duration: linkedStep.duration,
                minPrice: linkedStep.minPrice,
                order: req.query.linkedStepOrder,
                score: 5,
            };

            // Get the main step, and add this linkedStep to the main
            Step.findOneAndUpdate(
                { _id: mainStep },
                { $push: { linkedSteps: linkedStepToAdd } },
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
            };

            Step.findOneAndUpdate(
                { _id: mainStep },
                { $push: { linkedSteps: linkedStep } },
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
       .limit(10)
       .exec(function(err, steps) {
            res.send(steps);
       });

};

/*
This function handles a step submission based on whether it is a submission for a linked step or a normal step.
*/
export const submitStep = (req, res) => {
    // If step is a linked step
    if (req.query.isLinkedStep) {
        addLinkedStep(req, res);
    } else {
        createStep(req, res);
    }
};
