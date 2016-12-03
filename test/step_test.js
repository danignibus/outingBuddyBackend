const expect = require('chai').expect;
const sinon = require('sinon');

import Step from '../app/models/step_model';

/*
Ensure that steps cannot be submitted by the user without all necessary fields.
*/
describe('step', function() {
    it('should be invalid if title is empty', function(done) {
        const step = new Step({
        	author: '92319023810923',
        	description: 'Test description',
        	duration: 6,
        });

        step.validate(function(err) {
            expect(err.errors.title).to.exist;
            done();
        });
    });

    it('should be invalid if author is empty', function(done) {
        const step = new Step({
        	description: 'Test description',
        	duration: 6,
        	title: 'Test title',
        });

        step.validate(function(err) {
            expect(err.errors.author).to.exist;
            done();
        });
    });

    it('should be invalid if description is empty', function(done) {
        const step = new Step({
        	author: 'Dani Gnibus',
        	duration: 6,
        	title: 'Test title',
        });

        step.validate(function(err) {
            expect(err.errors.description).to.exist;
            done();
        });
    });

    it('should be invalid if duration is empty', function(done) {
        const step = new Step({
        	author: 'Dani Gnibus',
        	description: 'Test description',
        	title: 'Test title',
        });

        step.validate(function(err) {
            expect(err.errors.duration).to.exist;
            done();
        });
    });
});
