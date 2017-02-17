import mongoose, { Schema } from 'mongoose';

// Each route corresponds to a concatenated group of step ids and contains the distance between them
const RouteSchema = new Schema({
    startStep: String,
    stepIds: String,
    route: [],
});

// create model class
const Route = mongoose.model('Route', RouteSchema);

export default Route;
