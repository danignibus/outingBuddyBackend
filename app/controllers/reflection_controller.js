import async from 'async';
import Reflection from '../models/reflection_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });
const OutingController = require('../controllers/outing_controller');
const UserController = require('../controllers/user_controller');
const NotFoundError = require('../errors/not_found_error');

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

    reflection.save()
        .then(result => {
            // update user's outings with the completed outing Id and the returned reflection Id
            UserController.updateCompletedOutings(req.user._id, result._id, req.query.outingId);
            OutingController.updateOutingRating(req.query.outingId, req.query.rating, res);
            res.send(result);
        }).catch(error => {
            res.send(error);
            // TODO: figure out NotFoundError
            // if (error instanceof NotFoundError) {
            //     console.log('error instanceof!!');
            //     res.status(404).send(error.message);
            // } else {
            //     res.send(error);
            // }
        });
};
