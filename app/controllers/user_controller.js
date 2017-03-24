import User from '../models/user_model';
import jwt from 'jwt-simple';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

const http = require('http');
const Notification = require('../services/notifications');

function tokenForUser(user) {
    const timestamp = new Date().getTime();
    return jwt.encode({ sub: user.id, iat: timestamp }, process.env.API_SECRET);
}

/*
This function gets a user by phone number.
*/
export const getUser = (callback, phoneNumber) => {
    User.findOne({ phoneNumber }).exec(callback);
};

/*
This function gets all users in the group '2'.
*/
export const getJournalUsers = (callback) => {
    User.find({ group: '2' }).exec(callback);
};

/*
This function gets all users.
*/
export const getUsers = (callback) => {
    User.find().exec(callback);
};

/*
This function is called when an outing is created. It invites any friends who are participating in
the outing but whose phone numbers are not currently registered with the app to download the app by
sending them a link.
*/
export const inviteFriends = (req, res, outingId) => {
    // get user with that phone number, update lastPrompted to current time
    if (req.query.invited) {
        // Go through each phone number and see if they are in the DB
        const invited = req.query.invited;
        for (const invitee in invited) {
            User.findOne({ phoneNumber: invited[invitee] }).exec((err, user) => {
                if (err) {
                    return res.send();
                }
                if (user === null) {
                    // If it includes country code, remove
                    if (invited[invitee].length === 11) {
                        invited[invitee] = invited[invitee].slice(1);
                    }
                    // Make request to /invite for that user
                    http.get(`${process.env.HEROKU_APP}/invite?phoneNumber=${invited[invitee]}&inviter=${req.user.name}`);
                } else {
                    if (user.playerId !== undefined) {
                        const message = {
                            app_id: process.env.ONESIGNAL_APP_ID,
                            contents: { 'en': `You\'ve been invited to an outing by ${req.user.name}` },
                            include_player_ids: [`${user.playerId}`],
                        };
                        Notification.sendNotification(message);
                    }
                    User.findOneAndUpdate(
                        { _id: user._id },
                        { $push: { invitedOutings: outingId } },
                        (err, user) => {
                            if (err) {
                                console.log('Error adding to invitedOutings for user');
                            }
                        });
                }
            });
        }
    }
};

/*
This function is specific to the SMS-bot study; it updated a lastPrompted field to the current
time for a specific user in order to calculate when the user next needed to be prompted.
*/
export const updateLastPrompted = (phoneNumber) => {
    // get user with that phone number, update lastPrompted to current time
    const now = new Date();
    User.findOneAndUpdate(
        { phoneNumber },
        { lastPrompted: now },
        (err, user) => {
            if (err) {
                console.log('got an error in updateLastPrompted');
            }
        });
};

/*
This function is specific to the SMS-bot study; it was called when users submitted
a 'journal' entry via text.
*/
export const saveJournalEntry = (phoneNumber, journal) => {
    // get user with that phone number, push journal onto journals array
    User.findOneAndUpdate(
        { phoneNumber },
        { $push: { journals: journal } },
        (err, user) => {
            if (err) {
                console.log('Error saving SNS journal entry');
            }
        });
};

/*
This function updates the user's current outing to the input outing Id and step.
*/
export const saveCurrentOutingProgress = (res, userId, outingId, currentStep) => {
    User.findOneAndUpdate(
        { _id: userId },
        { $set: { currentOuting: [outingId, currentStep] },
        },
        (err, user) => {
            if (err) {
                // TODO: update error
                return res.status(400).send('Error saving current outing progress');
            }
        });
};

/*
This function stores the player Id submitted by client.
*/
export const saveUserPlayerId = (req, res) => {
    User.findOneAndUpdate(
        { _id: req.user._id },
        { playerId: req.query.playerId },
        (err, user) => {
            if (err) {
                return res.status(400).send('Error saving user player Id');
            } else {
                return res.status(200).send('User player Id updated successfully');
            }
        });
};

/*
This function is called by the client when the user moves onto a new step. It
calls saveCurrentOutingProgress, which updates the database according to the
user's currentOuting field to the proper outing Id and step.
*/
export const updateUser = (req, res) => {
    if (req.query.playerId) {
        saveUserPlayerId(req, res);
    } else if (req.query.outingId && req.query.currentStep) {
        saveCurrentOutingProgress(res, req.user._id, req.query.outingId, req.query.currentStep);
        res.send('Successfully updated current outing progress');
    }
};

/*
This function returns the current outing and step that the user is on.
*/
export const getOutingProgress = (req, res, next) => {
    User.findOne({ _id: req.user._id }).exec((err, user) => {
        const currentOuting = user.currentOuting;
        res.json({
            currentOuting,
        });
    });
};

/*
This function gets user name and profile picture, completed outing IDs and
corresponding reflection IDs for a user.
Note: this is a work in progress; we need to determine what should be displayed
on the frontend. I'm leaning toward image of outing and a snippet of the reflection.
Once we decide, I will modify the query accordingly.
*/
export const getUserProfile = (req, res, next) => {
    User.findOne({ _id: req.user._id }).exec((err, user) => {
        const name = user.name ? user.name : null;
        const outings = user.outings ? user.outings : null;
        const image = user.image ? user.image : null;

        res.json({
            name,
            image,
            outings,
        });
    });
};

/*
Adds object to user's outings array with the outing ID, reflection ID, user's rating,
and an image of the outing.
*/
export const updateCompletedOutings = (userId, reflectionId, rating, outing, date) => {
    const outingSteps = outing.detailedSteps;
    const outingStepLength = outingSteps.length;
    const randomStep = outingSteps[Math.floor(Math.random() * outingStepLength)];
    const outingImage = randomStep.image || null;
    const userRating = rating || null;
    const outingDate = date || null;

    User.findOneAndUpdate(
        { _id: userId },
        { $push: { outings: {
            date: outingDate,
            outingId: outing._id,
            reflectionId,
            userRating,
            outingImage },
            completedSteps: { $each: outing.stepIds },
        } },
        (err, user) => {
            if (err) {
                console.log('Error updating completed outings for user');
            }
        });
};

/*
Returns a new token upon signin for user. Passport middleware performs password checks.
*/
export const signin = (req, res, next) => {
    res.send({ token: tokenForUser(req.user) });
};

/*
This function allows a user to sign up with phone number and password. It ensures that
the phone number does not already exist in the database and creates a new User object if not.
Otherwise, it returns an error.
*/
export const signup = (req, res, next) => {
    const phoneNumber = req.query.phoneNumber;
    const password = req.query.password;
    const name = req.query.name;

    if (!phoneNumber || !password) {
        return res.status(422).send('You must provide phone number and password');
    }
    if (phoneNumber.length !== 10) {
        return res.status(422).send('Phone number length must be 10 digits');
    }
    if (password.length < 8) {
        return res.status(422).send('Password must be at least 8 characters');
    }

    // mongo query to find if a user already exists with this email.
    User.findOne({ phoneNumber }).exec((err, obj) => {
        if (obj == null) {
            const user = new User();
            user.name = name;
            user.phoneNumber = phoneNumber;
            user.password = password;

            user.save()
                .then(result => {
                    res.send({ token: tokenForUser(user) });
                })
            .catch(error => {
                res.send(error);
            });
        } else {
            return res.status(409).send('User already exists');
        }
    });
};
