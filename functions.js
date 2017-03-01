// Functionality used by the AWS Lambda function.
//
// This is a separate module for automated testing.

/* jshint node: true */
/* jshint esversion: 6 */

"use strict";

const querystring = require('querystring');

// The Lambda handler function calls this function. It receives the request (in
// its event parameter) and calls a callback to pass back the result.
//
// We send back the HTML as the result of function execution by passing a string
// containing HTML as the result to the callback. For documentation about the
// Lambda callback function's behaviour, please see
// http://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
//
// Rather than using the callback's error parameter, we try to always indicate
// there was no error (by passing null as its first parameter) and show an
// error page by making that the result. This is because if we use the error
// parameter then our result is JSON. This is not nice when we expect the source
// of the request to be browsers.
//
// Parameters:
// - config. Object. The eggcorn config object.
// - sns. Object. This object must have a publish() function. For its input,
//   refer to the AWS.SNS documentation.
// - date. Object. This object must provide a now() function which returns the
//   epoch time in milliseconds.
// - uuidgen. Function. Calling this function must generate a UUID.
// - evt. Object. This is the Lambda event object containing the input for the
//   run. We require it to have 3 properties: body, ip, useragent. Refer to
//   get_comment() for their form.
// - callback. Function. This is the Lambda callback function. Refer to the
//   Lambda documentation for its behaviour.
//
// Returns: Nothing directly. It returns values using the calback parameter.
exports.handle_request = function(config, sns, date, uuidgen, evt, callback) {
	const comment = exports.get_comment(evt, date, uuidgen);
	if (typeof comment === 'string') {
		const html = exports.make_error_html(config, comment);
		callback(null, html);
		return;
	}

	exports.publish_comment_to_sns(
		sns,
		config.sns_arn,
		comment,
		function(err, comment) {
			if (err) {
				const html = exports.make_error_html(config, err);
				callback(null, html);
				return;
			}

			const html = exports.make_success_html(config, comment);
			callback(null, html);
		}
	);
};

// Retrieve and validate input (our comment) from the Lambda event.
//
// We also assign an identifier and the time we receive the comment.
//
// Parameters:
// - evt, Object passed to Lambda function. It should have these properties set:
//   - body, string, which should be application/x-www-form-urlencoded and be
//     the raw request body from the user. The URL encoded fields that must be
//     present are:
//     - name, string, the commenter's name
//     - email, string, the commenter's email
//     - text, string, the comment
//     - url, string, the page to comment on
//   - ip, string, the source IP.
//   - useragent, string, the source User-Agent.
// - date, Object. We use this object to determine the current datetime. It must
//   have a now function returning the epoch time in milliseconds.
// - uuidgen, Function. When called it should generate a UUID.
//
// Returns: An object describing the comment, or a string with a plaintext error
// message.
//
// The Object describing the comment has fields:
// - name, string, the name the commenter supplied.
// - email, string, the email address the commenter supplied.
// - text, string, the comment text.
// - url, string, the URL this comment relates to.
// - ip, string, the IP submitting the comment.
// - useragent, string, the user-agent submitting the comment.
// - time, integer, epoch time of receipt of comment.
// - id, string, UUID generated for this comment.
//
// We validate each string field is not zero length.
exports.get_comment = function(evt, date, uuidgen) {
	const comment = {};

	// Pull out the fields from the request body.

	if (!evt.hasOwnProperty('body') || typeof evt.body !== 'string') {
		return 'No body found';
	}

	// parse() decodes to UTF-8.
	const params = querystring.parse(evt.body);

	const body_fields = ['name', 'email', 'text', 'url'];
	for (let i = 0; i < body_fields.length; i++) {
		const field = body_fields[i];

		// We can't use hasOwnProperty() on params. It does not extend from Object.
		if (typeof params[field] !== 'string') {
			return 'Missing field: ' + field;
		}

		const value = params[field].trim();
		if (value.length === 0) {
			return 'Field must not be blank: ' + field;
		}

		comment[field] = value;
	}

	// Pull out other metadata from the event.

	const metadata_fields = ['ip', 'useragent'];
	for (let i = 0; i < metadata_fields.length; i++) {
		const field = metadata_fields[i];

		if (!evt.hasOwnProperty(field) || typeof evt[field] !== 'string') {
			return 'Missing metadata: ' + field;
		}

		const value = evt[field].trim();

		// User-Agent could legitimately not be there I suppose. But let's require
		// it regardless.
		if (value.length === 0) {
			return 'Metadata must not be blank: ' + field;
		}

		comment[field] = value;
	}

	// Set some fields we generate here.

	comment.id = uuidgen();
	comment.time = date.now();

	return comment;
};

// Publish the given comment to SNS.
//
// Parameters:
// sns, Object. This is the object providing the publish() function to publish
//   to SNS. For its behaviour, refer to the AWS.SNS documentation.
// sns_arn, ARN string to publish to.
// comment, Object. See get_comment() for its properties.
// callback, function to call after trying to publish. The first parameter
//   should be an error message (or null if there was no error), and the second
//   should be the comment. This is so we can report an error to the user if
//   necessary.
//
// Returns: None.
exports.publish_comment_to_sns = function(sns, sns_arn, comment, callback) {
	const msg = 'New comment from ' + comment.name + ":\n" + comment.text;
	console.log(msg);

	sns.publish(
		{
			'TopicArn':          sns_arn,
			'Message':           msg,
			'Subject':           'New comment',
			// Pass some additional data along.
			'MessageAttributes': {
				'name':      {'DataType': 'String', 'StringValue': comment.name           },
				'email':     {'DataType': 'String', 'StringValue': comment.email          },
				'text':      {'DataType': 'String', 'StringValue': comment.text           },
				'url':       {'DataType': 'String', 'StringValue': comment.url            },
				'ip':        {'DataType': 'String', 'StringValue': comment.ip             },
				'useragent': {'DataType': 'String', 'StringValue': comment.useragent      },
				'time':      {'DataType': 'Number', 'StringValue': comment.time.toString()},
				'id':        {'DataType': 'String', 'StringValue': comment.id             }
			}
		},
		function(err, data) {
			if (err) {
				console.log("sns.publish failed:");
				console.log(err);
				callback("Unable to publish comment", comment);
				return;
			}
			callback(null, comment);
		}
	);
};

// Make HTML page (as a string) describing an error.
//
// Parameters:
// - config, Object, the eggcorn configuration.
// - err, string, an error message to display
//
// Returns: A string, HTML
exports.make_error_html = function(config, err) {
	if (typeof err !== 'string' || err.length === 0) {
		err = 'Error message is missing';
	}

	const html = `<!DOCTYPE html>
<meta charset="utf-8">
<title>` + exports.html_escape(config.page_title) + ` - Error!</title>
<meta name="viewport" content="width=device-width, user-scalable=no">
<h1>Error!</h1>
<p>Unfortunately I was not able to submit your comment. Sorry!</p>
<p>The error was: ` + exports.html_escape(err) + `</p>
<p>If you think this is a mistake, I'd appreciate hearing about it!
Please contact me at ` + exports.html_escape(config.admin_email) + `.
Thank you!</p>
`;

	return html;
};

// Make HTML page (as a string) claiming success.
//
// Parameters:
// - config, Object, the eggcorn configuration.
// - comment, Object, refer to get_comment() for information about this object.
//
// Returns a string, HTML.
exports.make_success_html = function(config, comment) {
	const html = `<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, user-scalable=no">
<title>` + exports.html_escape(config.page_title) + ` - Thank you</title>
<h1>Thank you</h1>
<p>Thanks for the comment, ` + exports.html_escape(comment.name) + `!
You should see it posted soon.</p>
<p>To go back where you were, please click
<a href="` + exports.html_escape(comment.url) + `">here</a>.</p>
`;

	return html;
};

// HTML escape the given string.
//
// Parameter: A string to escape for safe inclusion in HTML.
//
// Returns a string with the following characters escaped:
// & becomes &amp;
// < becomes &lt;
// > becomes &gt;
// ' becomes &#39;
// " becomes &#34;
//
// There are node packages that provide this functionality but:
// - This is simple enough to write, so I'd rather avoid a dependency.
// - The one I was thinking of, html-entities, appears to escape many more
//   characters than I think is necessary (beyond the 5 I mention).
exports.html_escape = function(s) {
	if (typeof s !== 'string') {
		return '';
	}

	return s.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/'/g, '&#39;')
		.replace(/"/g, '&#34;');
};
