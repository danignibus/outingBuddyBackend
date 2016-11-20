import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const StepSchema = new Schema({
    title: String,
    description: String,
    duration: Number,
    participants: String,
    lat: Number,
    lng: Number,
    author: String,
});

// create model class
const Step = mongoose.model('Step', StepSchema);

export default Step;
