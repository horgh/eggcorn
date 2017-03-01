// Unit tests.

/* jshint node: true */
/* jshint esversion: 6 */

"use strict";

const config = require('./config.js');
const functions = require('./functions.js');

const run_tests = function() {
	let failed = 0;

	if (!test_get_comment()) {
		failed++;
	}

	if (!test_publish_comment_to_sns()) {
		failed++;
	}

	if (!test_make_error_html()) {
		failed++;
	}

	if (!test_make_success_html()) {
		failed++;
	}

	if (!test_html_escape()) {
		failed++;
	}

	if (failed > 0) {
		console.log("Some tests failed!");
		return false;
	}

	console.log("All tests passed.");
	return true;
};

const test_publish_comment_to_sns = function() {
	const tests = [
		{
			sns_arn: 'test:arn',
			comment: {
				name:  'John Public',
				email: 'john@example.com',
				text:  'Nice site',
				url:   'https://www.example.com',
				ip:    '127.0.0.1',
				time:  123,
				id:    'aaa-bbb'
			},
			output: {
				TopicArn: 'test:arn',
				Message:  "New comment from John Public:\nNice site",
				Subject:  'New comment',
				MessageAttributes: {
					name:  {StringValue: 'John Public'},
					email: {StringValue: 'john@example.com'},
					text:  {StringValue: 'Nice site'},
					url:   {StringValue: 'https://www.example.com'},
					ip:    {StringValue: '127.0.0.1'},
					time:  {StringValue: '123'},
					id:    {StringValue: 'aaa-bbb'}
				}
			}
		}
	];

	// Dummy SNS objects. They just make the published object accessible for us
	// to check, and call the callback indicating an error or not.

	let published_object = null;

	const dummy_sns_that_succeeds = {
		publish: function(o, callback) {
			published_object = o;
			callback(null, {});
		}
	};

	const dummy_sns_that_fails = {
		publish: function(o, callback) {
			published_object = o;
			callback('out of memory', {});
		}
	};

	// Callback that sns.publish() calls.
	let callback_error = null;
	let callback_comment = null;
	const dummy_callback = function(err, comment) {
		callback_error = err;
		callback_comment = comment;
	};

	let failed = 0;
	test_loop:
	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		functions.publish_comment_to_sns(dummy_sns_that_succeeds, test.sns_arn,
			test.comment, dummy_callback);

		const top_props = ['TopicArn', 'Message', 'Subject'];
		for (let j = 0; j < top_props.length; j++) {
			const prop = top_props[j];

			if (published_object[prop] !== test.output[prop]) {
				console.log("publish_comment_to_sns " + prop + " = " +
					published_object[prop] + ", wanted " + test.output[prop]);
				failed++;
				break test_loop;
			}
		}

		const attributes = ['name', 'email', 'text', 'url', 'ip', 'time', 'id'];
		for (let j = 0; j < attributes.length; j++) {
			const prop = attributes[j];

			if (published_object.MessageAttributes[prop].StringValue !==
				test.output.MessageAttributes[prop].StringValue) {
				console.log("publish_comment_to_sns " + prop + " = " +
					published_object.MessageAttributes[prop].StringValue + ", wanted " +
					test.output.MessageAttributes[prop].StringValue);
				failed++;
				break test_loop;
			}
		}

		if (callback_error !== null) {
			console.log("publish_comment_to_sns: success callback resulted in error?");
			failed++;
			continue;
		}

		// The comment should be the same. I just check a single field right now.
		if (callback_comment.name !== test.comment.name) {
			console.log("publish_comment_to_sns: success callback comment mismatch");
			failed++;
			continue;
		}

		// Call with a dummy SNS that fails.
		//
		// We don't need to check the published object again. It's the same in
		// either case. Check that we received an error though.

		functions.publish_comment_to_sns(dummy_sns_that_fails, test.sns_arn,
			test.comment, dummy_callback);

		if (callback_error !== 'Unable to publish comment') {
			console.log("publish_comment_to_sns: error callback had no error?");
			failed++;
			continue;
		}
	}

	if (failed > 0) {
		console.log("publish_comment_to_sns: " + failed + "/" + tests.length +
			" tests failed!");
		return false;
	}

	return true;
};

const test_get_comment = function() {
	const tests = [
		// No body at all.
		{
			input: {},
			error: 'No body found',
			output: null
		},

		// Body present, but missing fields.
		{
			input: {
				body: 'name=Joe%20Public'
			},
			error: 'Missing field: email',
			output: null
		},

		// Body present and all fields present, but some blank.
		{
			input: {
				body: 'name=Joe%20Public&email=&text=Nice%20post&url=https%3a%2f%2fwww.example.com'
			},
			error: 'Field must not be blank: email',
			output: null
		},

		// Valid body. But missing metadata.
		{
			input: {
				body: 'name=Joe%20Public&email=joe%40example.com&text=Nice%20post&url=https%3a%2f%2fwww.example.com'
			},
			error: 'Missing metadata: ip',
			output: null
		},

		// Valid body. Metadata is present but some is blank.
		{
			input: {
				body:      'name=Joe%20Public&email=joe%40example.com&text=Nice%20post&url=https%3a%2f%2fwww.example.com',
				ip:        "127.0.0.1",
				useragent: ""
			},
			error: 'Metadata must not be blank: useragent',
			output: null
		},

		// All fields present.
		{
			input: {
				body:      'name=Joe%20Public&email=joe%40example.com&text=Nice%20post&url=https%3a%2f%2fwww.example.com',
				ip:        "127.0.0.1",
				useragent: "Nice bot"
			},
			error: null,
			output: {
				name:      'Joe Public',
				email:     'joe@example.com',
				text:      'Nice post',
				url:       'https://www.example.com',
				ip:        '127.0.0.1',
				useragent: 'Nice bot',
				time:      123,
				id:        'aaa-bbb'
			}
		}
	];

	const dummy_date = { now: function() { return 123; } };
	const dummy_uuid = function() { return 'aaa-bbb'; };

	let failed = 0;

	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		const output = functions.get_comment(test.input, dummy_date, dummy_uuid);
		if (test.error !== null) {
			if (output !== test.error) {
				console.log("get_comment(" + test.input + ") = " + output +
					", wanted error " + test.error);
				failed++;
				continue;
			}
			continue;
		}

		for (let prop in test.output) {
			if (output[prop] !== test.output[prop]) {
				console.log("get_comment(" + test.input + ") property " +
					prop + " = " + output[prop] + ", wanted " + test.output[prop]);
				failed++;
				break;
			}
		}
	}

	if (failed > 0) {
		console.log("get_comment: " + failed + "/" + tests.length +
			" tests failed!");
		return false;
	}

	return true;
};

const test_make_error_html = function() {
	const tests = [
		{
			config: {page_title: 'my site', admin_email: 'joe@example.com'},
			error: "The site is down",
			output_patterns: [
				/I was not able to submit your comment/,
				/The error was: The site is down/,
				/Please contact me at joe@example.com/
			]
		}
	];

	let failed = 0;

	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		const output = functions.make_error_html(test.config, test.error);

		for (let j = 0; j < test.output_patterns.length; j++) {
			const pattern = test.output_patterns[j];

			if (output.match(pattern) === null) {
				console.log("make_error_html() = " + output + ", wanted pattern: " +
					pattern);
				console.log(test.config);
				console.log(test.comment);
				failed++;
				break;
			}
		}
	}

	if (failed > 0) {
		console.log("make_error_html: " + failed + "/" + tests.length +
			" tests failed!");
		return false;
	}

	return true;
};

const test_make_success_html = function() {
	const tests = [
		{
			config: {page_title: 'my site'},
			comment: {name: 'John Public', url: 'https://www.example.com'},
			output_patterns: [
				/Thanks for the comment, John Public!/,
				/please click\s<a href="https:\/\/www\.example\.com">here<\/a>/
			]
		},
		{
			config: {page_title: 'my site'},
			comment: {name: 'John P&ublic', url: 'https://www.example.com'},
			output_patterns: [
				/Thanks for the comment, John P&amp;ublic!/,
				/please click\s<a href="https:\/\/www\.example\.com">here<\/a>/
			]
		}
	];

	let failed = 0;

	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		const output = functions.make_success_html(test.config, test.comment);

		for (let j = 0; j < test.output_patterns.length; j++) {
			const pattern = test.output_patterns[j];

			if (output.match(pattern) === null) {
				console.log("make_success_html() = " + output + ", wanted pattern: " +
					pattern);
				console.log(test.config);
				console.log(test.comment);
				failed++;
				break;
			}
		}
	}

	if (failed > 0) {
		console.log("make_success_html: " + failed + "/" + tests.length +
			" tests failed!");
		return false;
	}

	return true;
};

const test_html_escape = function() {
	const tests = [
		{input: 'abc',          output: 'abc'},
		{input: 'a&c',          output: 'a&amp;c'},
		{input: '<a x="&" c>',  output: '&lt;a x=&#34;&amp;&#34; c&gt;'},
		{input: "'abc'",        output: '&#39;abc&#39;'},
		{input: 'á',            output: 'á'},
		{input: '<<>>""&&\'\'', output: '&lt;&lt;&gt;&gt;&#34;&#34;&amp;&amp;&#39;&#39;'}
	];

	let failed = 0;

	for (let i = 0; i < tests.length; i++) {
		const test = tests[i];

		const output = functions.html_escape(test.input);
		if (output !== test.output) {
			console.log("html_escape(" + test.input + ") = " + output + ", wanted " +
				test.output);
			failed++;
		}
	}

	if (failed > 0) {
		console.log("html_escape: " + failed + "/" + tests.length +
			" tests failed!");
		return false;
	}

	return true;
};

if (!run_tests()) {
	process.exit(1);
}
