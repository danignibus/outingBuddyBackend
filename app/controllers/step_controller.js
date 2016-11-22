import Step from '../models/step_model';
import dotenv from 'dotenv';
dotenv.config({ silent: true });

export const createStep = (req, res) => {
    const step = new Step();

    //step.author = req.user;
    step.description = req.query.description;
    step.duration = req.query.duration;
    step.loc.coordinates = [req.query.lng, req.query.lat];
    step.loc.type = 'Point';
    step.participants = req.query.participants || 'UNLIMITED';
    step.title = req.query.title;
    step.warmup = req.query.warmup || 0;

    // TODO: get req.user
    step.save()
        .then(result => {
            res.send(result);
        })
    .catch(error => {
        res.send(error);
    });
};
