import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const StepSchema = new Schema({
    author: String,
    description: String,
    duration: Number,
    loc: {
        type: { type: String },
        coordinates: [Number],
    },
    title: String,
    participants: String,
    warmup: Number,
});

// create model class
const Step = mongoose.model('Step', StepSchema);

export default Step;
