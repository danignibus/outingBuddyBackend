const should = require('should');
const assert = require('assert');
const request = require('supertest');
const mongoose = require('mongoose');

// Inspired by these sources:
// https://thewayofcode.wordpress.com/2013/04/21/how-to-build-and-test-rest-api-with-nodejs-express-mocha/
// http://mherman.org/blog/2015/09/10/testing-node-js-with-mocha-and-chai/#.WIJt5rYrLEY

describe('Outing', function() {

    const url = 'http://localhost:9090';


   // before(function(done) {
        // Want to use the test DB
        // const mongoURI = 'mongodb://localhost/test';
        // mongoose.connect(mongoURI);
        // done();
   // });

    describe('Getting outings', function() {

        // const mongoURI = 'mongodb://localhost/test';
        // mongoose.connect(mongoURI);
        const signinInfo = {
            name: 'Dani Gnibus',
            password: 'testpassword',
            phoneNumber: '5555555855',
        };
        let userToken;

        it('should successfully sign in user and receive token', function(done) {
            request(url)
                .post('/api/signin')
                .query(signinInfo)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    } else {
                        userToken = res.body.token;
                    }
                    res.status.should.be.equal(200);
                    done();
                });
        });

        it('should successfully get a 1 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 1,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(60);
                    done();
                });
        });

        it('should successfully get a 2 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 2,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(120);
                    done();
                });
        });

        it('should successfully get a 3 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 3,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(180);
                    done();
                });
        });

        it('should successfully get a 4 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 4,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(240);
                    done();
                });
        });

        it('should successfully get a 5 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 5,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(300);
                    done();
                });
        });

        it('should successfully get a 6 hour outing from DB', function(done) {
            const outingRequest = {
                duration: 6,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    let duration = 0;
                    for (const item in res.body.detailedSteps) {
                        duration += res.body.detailedSteps[item].duration;
                    }
                    duration.should.be.equal(360);
                    done();
                });
        });

        it('should return a 404 when not enough activities are present in the DB', function(done) {
            const outingRequest = {
                duration: 430,
            };
            request(url)
                .get('/api/outing')
                .set('Authorization', userToken)
                .query(outingRequest)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(404);
                    done();
                });
        });

        // Add test to verify that if warmup is not available, get a 404

    });

});
