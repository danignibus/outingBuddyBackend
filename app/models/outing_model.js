import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const OutingSchema = new Schema({
    detailedSteps: [],
    stepIds: [],
    rating: Number,
    raters: Number,
});

// create model class
const Outing = mongoose.model('Outing', OutingSchema);

export default Outing;
