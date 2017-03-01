// Unit tests.

/* jshint node: true */
/* jshint esversion: 6 */

"use strict";

const config = require('./config.js');
const functions = require('./functions.js');

const run_tests = function() {
	let failed = 0;

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
