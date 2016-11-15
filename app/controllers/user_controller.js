import User from '../models/user_model';
const util = require('util')
import jwt from 'jwt-simple';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

export const getUser = (callback, phoneNumber) => {
    User.findOne({ 'phoneNumber': phoneNumber }).exec(callback);
};

export const getJournalUsers = (callback) => {
    User.find({'group': '2'}).exec(callback);
};

export const getUsers = (callback) => {
    User.find().exec(callback);
};

export const updateLastPrompted = (phoneNumber) => {
    //get user with that phone number, update lastPrompted to current time
    var now = new Date();
    User.findOneAndUpdate(
        {'phoneNumber': phoneNumber},
        {'lastPrompted': now},
        function(err, user) {
            if (err) {
                console.log('got an error in updateLastPrompted');
            }
        });
};

export const saveJournalEntry = (phoneNumber, journal) => {
    //get user with that phone number, push journal onto journals array
    User.findOneAndUpdate(
        {'phoneNumber': phoneNumber},
        {$push: {'journals': journal}},
        function(err, user) {
            if (err) {
                console.log('got an error in saveJournalEntry');
            }
        });
};

//Return a new token
export const signin = (req, res, next) => {
    console.log('got to signin');
    res.send({ token: tokenForUser(req.user) });
};

export const signup = (req, res, next) => {
    const phoneNumber = req.query.phoneNumber;
    const password = req.query.password;

    if (!phoneNumber || !password) {
        console.log('phoneNumber' + phoneNumber);
        console.log('password' + password);
        return res.status(422).send('You must provide phone number and password');
    }
    // mongo query to find if a user already exists with this email.
    //TODO: remove addition of plus sign for phone number
    var formattedPhoneNumber = `+${phoneNumber}`;
    User.findOne({'phoneNumber': formattedPhoneNumber}).exec((err, obj) => {
        if (obj == null) {
            const user = new User();
            user.phoneNumber = formattedPhoneNumber;
            user.password = password;

            user.save()
                .then(result => {
                    console.log('user created!')
                    res.send({ token: tokenForUser(user) });
                })
            .catch(error => {
                console.log(error)
            });
        } else {
            return res.status(409).send('User already exists');
        }
    });
    
    // if user exists then return an error. If not, use the User model to create a new user.
    // Save the new User object
    // this is similar to how you created a Post
    // and then return a token same as you did in in signin
};

function tokenForUser(user) {
    const timestamp = new Date().getTime();
    return jwt.encode({ sub: user.id, iat: timestamp }, process.env.API_SECRET);
}
