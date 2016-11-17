import User from '../models/user_model';
import jwt from 'jwt-simple';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

function tokenForUser(user) {
    const timestamp = new Date().getTime();
    return jwt.encode({ sub: user.id, iat: timestamp }, process.env.API_SECRET);
}

export const getUser = (callback, phoneNumber) => {
    User.findOne({ phoneNumber }).exec(callback);
};

export const getJournalUsers = (callback) => {
    User.find({ group: '2' }).exec(callback);
};

export const getUsers = (callback) => {
    User.find().exec(callback);
};

export const updateLastPrompted = (phoneNumber) => {
    // get user with that phone number, update lastPrompted to current time
    const now = new Date();
    User.findOneAndUpdate(
        { phoneNumber },
        { lastPrompted: now },
        function(err, user) {
            if (err) {
                console.log('got an error in updateLastPrompted');
            }
        });
};

export const saveJournalEntry = (phoneNumber, journal) => {
    //get user with that phone number, push journal onto journals array
    User.findOneAndUpdate(
        { phoneNumber },
        { $push: {journals: journal } },
        function(err, user) {
            if (err) {
                console.log('got an error in saveJournalEntry');
            }
        });
};

// Return a new token
export const signin = (req, res, next) => {
    res.send({ token: tokenForUser(req.user) });
};

export const signup = (req, res, next) => {
    const phoneNumber = req.query.phoneNumber;
    const password = req.query.password;

    if (!phoneNumber || !password) {
        return res.status(422).send('You must provide phone number and password');
    }

    // mongo query to find if a user already exists with this email.
    // TODO: remove addition of plus sign for phone number
    const formattedPhoneNumber = `+${phoneNumber}`;
    User.findOne({ phoneNumber: formattedPhoneNumber }).exec((err, obj) => {
        if (obj == null) {
            const user = new User();
            user.phoneNumber = formattedPhoneNumber;
            user.password = password;

            user.save()
                .then(result => {
                    res.send({ token: tokenForUser(user) });
                })
            .catch(error => {
                console.log(error);
            });
        } else {
            return res.status(409).send('User already exists');
        }
    });
};
