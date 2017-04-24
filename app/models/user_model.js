import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt-nodejs';

// create a schema for outings/description
const UserSchema = new Schema({
    completedSteps: [],
    currentOuting: [],
    group: String,
    image: String,
    invitedOutings: [],
    journals: [],
    lastPrompted: Date,
    name: String,
    outings: [],
    password: String,
    phoneNumber: { type: String, required: true },
    playerId: String,
    rewardStudy: { type: Number, default: 0 },
});

UserSchema.set('toJSON', {
    virtuals: true,
});

UserSchema.pre('save', function beforeUserSave(next) {
    const user = this;
    bcrypt.genSalt(10, (err, salt) => {
        if (err) { return next(err); }
        if (!user.isModified('password')) return next();

        // hash (encrypt) our password using the salt
        bcrypt.hash(user.password, salt, null, (err, hash) => {
            if (err) { return next(err); }
            // overwrite plain text password with encrypted password
            user.password = hash;
            return next();
        });
    });
});

UserSchema.methods.comparePassword = function comparePassword(candidatePassword, callback) {
    bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
        if (err) { return callback(err); }
        callback(null, isMatch);
    });
};

// create model class
const User = mongoose.model('User', UserSchema);

export default User;

// structure for users; last contacted interval; something that runs periodically
// for bots that run on Heroku--either keep awake @ all times or

// Heroku: if you have an incoming HTTP request to some path, it wakes up
// Slack: polling client. your Heroku instance polls slack

// default Heroku plan: schedule something to hit it every hour--Heroku scheduler plugin.
// have it listen to /checkup, when it hits URL crank through all entries and figure out
// whether any is over the time, then clear flags
