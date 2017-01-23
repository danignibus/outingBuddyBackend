const should = require('should');
const assert = require('assert');
const request = require('supertest');
const mongoose = require('mongoose');

// Inspired by these sources:
// https://thewayofcode.wordpress.com/2013/04/21/how-to-build-and-test-rest-api-with-nodejs-express-mocha/
// http://mherman.org/blog/2015/09/10/testing-node-js-with-mocha-and-chai/#.WIJt5rYrLEY

describe('Routing', function() {

    const url = 'http://localhost:9090';


   // before(function(done) {
        // Want to use the test DB
        // const mongoURI = 'mongodb://localhost/test';
        // mongoose.connect(mongoURI);
        // done();
   // });

    describe('Authentication', function() {

        const mongoURI = 'mongodb://localhost/test';
        mongoose.connect(mongoURI);
        const signupInfo = {
            name: 'Dani Gnibus',
            password: 'testpassword',
            phoneNumber: '5555555855'
        };

        const signupInfoBadPassword = {
            name: 'Dani Gnibus',
            password: 'test',
            phoneNumber: '1234567890'
        };

        const signupInfoBadPhoneNumber = {
            name: 'Dani Gnibus',
            password: 'testtesttest',
            phoneNumber: '123'
        };


        it('should successfully sign up new user', function(done) {
            request(url)
                .post('/api/signup')
                .query(signupInfo)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(200);
                    done();
                });
        });


        it('should return user already exists when user is already in database', function(done) {
            request(url)
                .post('/api/signup')
                .query(signupInfo)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(409);
                    done();
                });
        });


        it('should return error when password is not long enough', function(done) {
            request(url)
                .post('/api/signup')
                .query(signupInfoBadPassword)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(422);
                    done();
                });
        });

        it('should return error when phone number is not properly formatted', function(done) {
            request(url)
                .post('/api/signup')
                .query(signupInfoBadPhoneNumber)
                .end(function(err, res){
                    if (err) {
                        console.log('error is: ' + err);
                    }
                    res.status.should.be.equal(422);
                    done();
                });
        });

        it('should return error when making outing request and user is not signed in', function(done) {
            request(url)
                .get('/api/outing/duration=3')
                // .auth('the-username', 'the-password')
                .end(function(err, res){
                    res.status.should.be.equal(404);
                    done();
                });
        });

        it('should return error when making user history request and user is not signed in', function(done) {
            request(url)
                .get('/api/user/history')
                .end(function(err, res){
                    res.status.should.be.equal(401);
                    done();
                });
        });

    });

});
