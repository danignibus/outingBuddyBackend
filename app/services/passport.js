import passport from 'passport';
import LocalStrategy from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';

import User from '../models/user_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

// options for local strategy, we'll use email AS the username
// not have separate ones
const localOptions = { usernameField: 'phoneNumber' };

// options for jwt strategy
// we'll pass in the jwt in an `authorization` header
// so passport can find it there
const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromHeader('authorization'),
    secretOrKey: process.env.API_SECRET,
};


// username + password authentication strategy
const localLogin = new LocalStrategy(localOptions, (phoneNumber, password, done) => {
    // Verify this email and password, call done with the user
    // if it is the correct email and password
    // otherwise, call done with false

    // TODO: remove hacky addition of plus sign to phoneNumber
    const formattedPhoneNumber = `+${phoneNumber}`;
    User.findOne({ phoneNumber: formattedPhoneNumber }, (err, user) => {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        // compare passwords - is `password` equal to user.password?
        user.comparePassword(password, (err, isMatch) => {
            if (err) {
                console.log('error');
                done(err);
            } else if (!isMatch) {
                done(null, false);
            } else {
                done(null, user);
            }
        });
    });
});

const jwtLogin = new JwtStrategy(jwtOptions, (payload, done) => {
    User.findById(payload.sub, (err, user) => {
        if (err) {
            done(err, false);
        } else if (user) {
            done(null, user);
        } else {
            done(null, false);
        }
    });
});

// Tell passport to use this strategy
passport.use(jwtLogin);
passport.use(localLogin);

export const requireAuth = passport.authenticate('jwt', { session: false });
export const requireSignin = passport.authenticate('local', { session: false });
