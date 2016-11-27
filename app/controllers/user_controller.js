import User from '../models/user_model';
import jwt from 'jwt-simple';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

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
    //get user with that phone number, push journal onto journals array
    User.findOneAndUpdate(
        { phoneNumber },
        { $push: { journals: journal } },
        (err, user) => {
            if (err) {
                console.log('got an error in saveJournalEntry');
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
                res.send('Error saving current outing progress');
            }
        });
};

/*
This function is called by the client when the user moves onto a new step. It
calls saveCurrentOutingProgress, which updates the database according to the
user's currentOuting field to the proper outing Id and step.
*/
export const updateUser = (req, res) => {
    // TODO: change user id to req.user._id
    // let tempUserId;
    // if (req.user._id) {
    //     tempUserId = req.user._id;
    // } else {
    //     tempUserId = process.env.TEST_USER_ID;
    // }

    const tempUserId = process.env.TEST_USER_ID;
   // const tempUserId = process.env.TEST_USER_ID;

    if (req.query.outingId && req.query.currentStep) {
        saveCurrentOutingProgress(res, tempUserId, req.query.outingId, req.query.currentStep);
        res.send('Successfully updated current outing progress');
    }
};

/*
This function returns the current outing and step that the user is on.
*/
export const getOutingProgress = (req, res, next) => {
    // TODO: change user id to req.user._id
    const tempUserId = process.env.TEST_USER_ID;
    User.findOne({ _id: tempUserId }).exec((err, user) => {
        const currentOuting = user.currentOuting;
        res.json({
            currentOuting,
        });
    });
};

/*
This function gets all completed outing IDs and corresponding reflection
IDs for a user.
Note: this is a work in progress; we need to determine what should be displayed
on the frontend. I'm leaning toward title of outing and a snippet of the reflection.
Once we decide, I will modify the query accordingly.
*/
export const getPastOutings = (req, res, next) => {
    // TODO: change user id to req.user._id
    const tempUserId = process.env.TEST_USER_ID;
    console.log('temp user id' + tempUserId);
    User.findOne({ _id: tempUserId }).exec((err, user) => {
        let outings;
        console.log(user);
        console.log('user outings type' + typeof user.outings);
        if (typeof user.outings === 'undefined') {
            outings = null;
        } else {
            outings = user.outings;
        }
        res.json({
            outings,
        });
    });
};


/*
Updates user's outings to include additonal outing Id and corresponding journal id.
*/
export const updateCompletedOutings = (userId, reflectionId, outingId) => {
    console.log('got to updatecompleted outings');
    User.findOneAndUpdate(
        { _id: userId },
        { $push: { outings: [outingId, reflectionId] } },
        (err, user) => {
            console.log('user' + user);
            if (err) {
                console.log('got an error in updateCompletedOutings');
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
