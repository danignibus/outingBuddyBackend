import Reflection from '../models/reflection_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });
const UserController = require('../controllers/user_controller');


/*
This function receives a reflection entry and outing ID from the client
and stores this reflection in the Mongo database. Additionally, because
the reflection signals completion of the outing, it makes a call to the
user_controller to store the outing Id and journal in the user object.
*/
export const addReflection = (req, res) => {
    const reflection = new Reflection();

    reflection.author = req.user._id;
    reflection.entry = req.query.entry;
    reflection.outingId = req.query.outingId;

    reflection.save()
        .then(result => {
            // update user's outings with the completed outing Id and the returned reflection Id
            UserController.updateCompletedOutings(req.user._id, result._id, req.query.outingId);
            res.send(result);
        })
    .catch(error => {
        res.send(error);
    });
};