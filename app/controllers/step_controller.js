import Step from '../models/step_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

/*
This function receives data from the client for a step submitted by a user,
and stores this step in the Mongo database.
*/
export const createStep = (req, res) => {
    const step = new Step();

    step.active = req.query.active || 0;
    step.author = req.user._id;
    step.description = req.query.description;
    step.duration = req.query.duration;
    step.loc.coordinates = [req.query.lng, req.query.lat];
    step.loc.type = 'Point';
    step.participants = req.query.participants || 'UNLIMITED';
    step.title = req.query.title;
    step.warmup = req.query.warmup || 0;

    step.save()
        .then(result => {
            res.send(result);
        })
    .catch(error => {
        res.send(error);
    });
};
