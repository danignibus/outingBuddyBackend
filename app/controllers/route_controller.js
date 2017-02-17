import Route from '../models/route_model';

/*
This function adds an optimal calculated route to the DB.
*/
export const saveRoute = (startStep, routeToSaveIdString, routeToSave) => {
    const route = new Route();

    route.stepIds = routeToSaveIdString;
    route.route = routeToSave;
    route.startStep = startStep;

    route.save()
        .then(result => {
            console.log(result);
        })
    .catch(error => {
        console.log(error);
    });
};
