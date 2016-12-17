const expect = require('chai').expect;
const sinon = require('sinon');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

const router = require('../app/router');
const outingController = require('../app/controllers/outing_controller');
import Step from '../app/models/step_model';

import { mockReq, mockRes } from 'sinon-express-mock'


describe('router', function() {
    // beforeEach(function() {
    //     sinon.stub(Step, 'find');
    // });

    // afterEach(function() {
    //     Step.find.restore();
    // });

    // TODO: finish filling this in
    // it('should create an outing based on steps', function() {
    //     const stepMock = sinon.mock(new Step({ title: 'Test step', description: 'Test description' }));
    //     const step = stepMock.object;
    //     console.log('got heree');

    //     var findOneStepResponse ={
    //         companyName:"xyz",
    //         email:"xyz@abc.com"
    //     };

    //     const findOne = sinon.stub(mongoose.Model, "findOne",function(err,callback){
    //         callback(null,findOneUserResponse);
    //     )};
    //     Step.findOne({}).exec((err, steps) => {
    //         console.log('got here too');
    //         console.log(steps.length);
    //         asldkfjalskdjflaskdjflkjf
    //         expect(steps.length).to.equal(1);
    //         // mlog.log('steps' + steps);
    //        // mlog.log('steps length' + steps.length);
    //     });

    it('should only accept valid requests', function() {
        const outingRequest = { query: { duration: 'abcde' } };

        const request = {
            query: {
                duration: 'abcde',
            },
        };

        const req = mockReq(request);
        const res = mockRes();

        outingController.validateOutingRequest(req, res);
        //console.log(res);
        //expect(res.json).to.be.calledWith({ foo: request.body.foo.bar })
    });
});


export const validateOutingRequest = (req, res) => {
    if (!req.query.duration) {
        return res.status(400).send('Duration not specified');
    } else if (req.query.duration > 6 || req.query.duration % 1 !== 0) {
        return res.status(400).send('Incorrect duration syntax');
    } else {
        initiateOuting(req, res);
    }
};
