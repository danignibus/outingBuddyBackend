import Reflection from '../models/reflection_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });
const OutingController = require('../controllers/outing_controller');
const StepController = require('../controllers/step_controller');
const UserController = require('../controllers/user_controller');

/*
This function receives a reflection entry and outing ID from the client
and stores this reflection in the Mongo database. Because the reflection
signals completion of the outing, the function also makes a call to the
user_controller to store the outing Id and journal in the user object. Finally,
the function makes a call to the outing controller to average in the user's
submitted rating of the outing to the outing's current ratings.
*/
export const addReflection = (req, res) => {
    const reflection = new Reflection();

    if (req.query.rating < 1.0 || req.query.rating > 5.0) {
        return res.status(400).send('Rating outside range; specify rating between 1.0 and 5.0');
    }

    reflection.author = req.user._id;
    reflection.entry = req.query.entry;
    reflection.outingId = req.query.outingId;
    reflection.rating = req.query.rating;
    reflection.date = Date.now();

    reflection.save()
        .then(result => {
            OutingController.updateOutingRating(req.query.outingId, req.query.rating, res, function (status, message, outing) {
                res.status(status).send(message);
                if (status === 200) {
                    UserController.updateCompletedOutings(req.user._id, result._id, req.query.rating, outing, reflection.date);
                    StepController.updateLinkedSteps(req.query.rating, outing);
                }
            });
        }).catch(error => {
            res.send(error);
        });
};

/*
This function receives a reflection ID and returns the corresponding reflection.
*/
export const getReflection = (req, res) => {
    Reflection.findOne({ _id: req.query.reflectionId }).exec((err, reflection) => {
        if (err) {
            res.status(404).send('No such reflection in DB; check reflection ID');
        } else {
            res.json({
                reflection,
            });
        }
    });
};
