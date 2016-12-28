import CONST from '../consts';
import Step from '../models/step_model';

/*
Not completely sure what kind of config data we want yet, but for now given a latitude
and longitude from the client the config endpoint will return a response of whether or not
steps exist in the area that could be used for an outing. This will likely eventually also
return some sort of user data.
*/
export const getConfigData = (req, res) => {
    let initialLocationCoordinates;
    if (req.query.lat && req.query.lng) {
        initialLocationCoordinates = [req.query.lng, req.query.lat];
    } else {
        initialLocationCoordinates = [-72.288719, 43.705267];
    }

    const radiusInRadians = CONST.CONFIG_RADIUS / 3959;

    // Perform basic query to see whether any steps are in immediate area.
    const query = {
        loc: {
            $geoWithin: {
                $centerSphere: [initialLocationCoordinates, radiusInRadians],
            },
        },
    };
    Step.find(query).exec((err, steps) => {
        if (err) {
            return res.status(404).send(`This area may not yet be supported; no steps in a ${CONST.CONFIG_RADIUS} mile radius of current location`);
        } else {
            return res.status(200).send('Adequate steps in surrounding area.');
            // TODO: Maybe check actual number of steps returned.
        }
    });
};
