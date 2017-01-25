import mongoose, { Schema } from 'mongoose';

// create a schema for outings/description
const StepSchema = new Schema({
    active: { type: Number, required: true },
    approved: Number,
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    durationRange: [Number],
    image: String,
    loc: {
        type: { type: String },
        coordinates: [Number],
    },
    repeat_interval: String,
    repeat_start: Number,
    title: { type: String, required: true },
    participants: String,
    warmup: Number,
});

// create model class
const Step = mongoose.model('Step', StepSchema);

export default Step;
