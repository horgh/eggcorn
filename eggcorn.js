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
// We send back the HTML as the result of function execution by passing a string
// containing HTML as the result to the callback. For documentation about how to
// use the callback, please see
// http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
exports.handler = function(evt, context, callback) {
	const comment = functions.get_comment(evt, Date, uuidV1);
	if (typeof comment === 'string') {
		const html = functions.make_error_html(config, comment);
		// Tell Lambda there was no error. Because we'd rather show an error page
		// than Lambda's raw JSON error response.
		callback(null, html);
		return;
	}

	const sns = new AWS.SNS();

	functions.publish_comment_to_sns(
		sns,
		config.sns_arn,
		comment,
		function(err, comment) {
			if (err) {
				const html = functions.make_error_html(config, err);
				callback(null, html);
				return;
			}

			const html = functions.make_success_html(config, comment);
			callback(null, html);
		}
	);
};
