const expect = require('chai').expect;
const sinon = require('sinon');

const router = require('../app/router');
import Step from '../app/models/step_model';

describe('router', function() {
    // beforeEach(function() {
    //     sinon.stub(Step, 'find');
    // });

    // afterEach(function() {
    //     Step.find.restore();
    // });

    // TODO: finish filling this in
    it('should create an outing based on steps', function() {
        var stepMock = sinon.mock(new Step({ title: 'Test step', description: 'Test description' }));
        var step = stepMock.object;

    });
});