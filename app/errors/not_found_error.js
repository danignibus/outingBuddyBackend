// module.exports = function NotFoundError(message, extra) {
//     Error.captureStackTrace(this, this.constructor);
//     this.name = this.constructor.name;
//     this.message = (message || '');
//     this.extra = extra;
// };

// require('util').inherits(module.exports, Error);

function NotFoundError(message) {
    this.message = message || 'Default Message';
}
NotFoundError.prototype = new Error();
