// This is an AWS Lambda function which accepts comments posted on pages.
//
// My intended use case is for comments on my blog posts.
//
// The function takes input from an HTTP POST'd form
// (application/x-www-form-urlencoded), publishes the comment via SNS, and
// outputs an HTML page.

/* jshint node: true */
/* jshint esversion: 6 */

"use strict";

const AWS = require('aws-sdk');
const config = require('./config.js');
const functions = require('./functions.js');
const uuidV1 = require('uuid/v1');

// Note for Lambda functions we do not need to set credentials on the AWS
// config.
AWS.config.region = config.aws_region;

// Lambda handler function.
//
// Pass in the event containing the request information. Use the callback
// function to return a result.
exports.handler = function(evt, context, callback) {
	const sns = new AWS.SNS();

	functions.handle_request(config, sns, Date, uuidV1, evt, callback);
};
