const chai = require('chai');
const chaiHttp = require('chai-http');
const router = require('../app/router');
const should = chai.should();

chai.use(chaiHttp);


describe('Outing', function() {
	it('should get an outing on /outing GET');
	chai.request(router)
		.get('/outing/duration=3')
		.end(function(err, res){
		res.should.have.status(200);
		done();
	});
});