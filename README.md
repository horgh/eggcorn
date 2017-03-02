This is an AWS Lambda function which accepts comments via HTTP form POST
requests and submits them for moderation via AWS SNS.

Its input is HTTP POST'd data (`application/x-www-form-urlencoded`) and its
output is an HTML page. This page thanks the person for commenting.

I use it for accepting comments on my blog posts.


# Setup
It makes use of these AWS components to operate:

  * API Gateway
  * Lambda
  * SNS

API Gateway provides an HTTP endpoint that connects to the Lambda function.

The Lambda function responds with HTML back through API Gateway. It publishes
the received comment to an SNS topic. This allows the comment to reach you for
moderation and posting.

Below I walk through configuring each of these components. You will need an AWS
account!


## Configure SNS
We configure SNS first because we need to set the SNS topic to use in our
configuration file.

  * Go to the SNS Dashboard.
  * Go to Topics.
  * Go to Create new topic.
  * Enter a Topic name. For example, `commentemail`.
  * Click on the new topic.
  * Click Create subscription.
  * Choose protocol Email-JSON.
    * The messages sent via SNS will have attributes visible in the JSON
      messages, including the commenter's name and their comment.
  * Enter your email address for the endpoint.
  * You will receive an email with a link to click to confirm the subscription.
  * Note the topic's ARN. It will look something like
    `arn:aws:sns:us-west-2:...`. You need this for the next step.


## Configure and build the Lambda package
We upload the Lambda function as a ZIP archive. Before we make the ZIP, we need
to create a configuration file.

  * Go into the `eggcorn` directory.
  * Copy `config.js.sample` to `config.js` and open it in an editor.
  * You must set all of the fields. The comments in the file should provide
    enough information.
  * Run `make`. This will create `package.zip`.


## Configure the Lambda function
We need to upload and configure the Lambda function now.

  * Go to Lambda management.
  * Click Create a Lambda function.
  * Choose Blank Function for the template.
  * Do not configure any triggers. Just click Next.
  * Enter a name, such as `eggcorn`.
  * Leave runtime as `Node.js 4.3`.
  * Change Code entry type to Upload a .ZIP file.
  * Beside Function package, click Upload. Choose the `package.zip` you created
    in the prior section.
  * Scroll down to Lambda function handler and role.
  * Set Handler to `eggcorn.handler`.
  * Set Role. You need to create a role, or use one you have. The role needs
    these permissions:
    * `AWSLambdaBasicExecutionRole` (to be able to log to CloudWatch)
    * `AmazonSNSFullAccess` (to be able to publish to SNS). You can be more
      fine grained than this policy, such as restricting to publishing only to
      a specific resource, if you like.
  * Scroll down to Advanced settings.
  * You can leave Memory at 128 MB and timeout at 3 seconds.
  * Click Next. Then click Create function.


## Configure API Gateway
We need to make the Lambda function accessible at an HTTP endpoint. We will
configure API Gateway to do this.

One of the core parts we will configure is how API Gateway transforms the
request to and response from the Lambda function. Lambda functions cannot take
input directly as `application/x-www-form-urlencoded`, nor output HTML
directly. Using API Gateway we transform the request before it reaches the
function, and transform the response before it reaches the client.

To read more about the templates I mention below, see the [API Gateway
documentation about
mapping](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#input-variable-reference).

  * Go to API Gateway.
  * Click Create API.
  * Enter an API name. For example, `eggcorn`.
  * Click Create API.
  * Under Actions choose Create Method.
  * Choose POST and click the checkmark.
  * Set Integration type to Lambda Function
  * Set Lambda Region to the AWS region with your function.
  * Set Lambda Function to the one you created above. For example `eggcorn` if
    that's what you named your function.
  * Clicking Save will prompt you about granting API Gateway permission to use
    the Lambda function. Click OK.
  * You will see a page with the four stages for processing the
    request/response through API Gateway. We need to configure what happens at
    three of the four stages.
  * Go to Integration Request.
    * Here we configure how API Gateway makes the request to the Lambda
      function. We need to transform the request body from the client from URL
      encoded into JSON. This is because Lambda functions take their input as
      JSON. We can't pass through the URL encoded body as is.
    * Click Add mapping template.
    * Enter Content-Type `application/x-www-form-urlencoded`.
    * Click the checkbox. You will be prompted to secure the integration. Do
      this. It means API Gateway will reject requests that do not have this
      Content-Type.
    * In the template box below, enter this template:
          {
          "body":      "$input.body",
          "ip":        "$context.identity.sourceIp",
          "useragent": "$context.identity.userAgent"
          }
    * Click Save.
    * What does this template mean? `$input.body` is the raw request payload.
      We make a JSON object and set the body on the property `body`. It is safe
      to double quote the raw payload and set it as a property as a well formed
      `application/x-www-form-urlencoded` string percent encodes '"'
      characters. We also pass in the source IP and the source User-Agent. This
      means our Lambda function's `event` parameter will contain these three
      pieces of information. The Lambda function must parse the encoded payload.
  * Go back to Method Execution and go to Method Response.
    * Note this must be done before we configure Integration Response because
      we need a header set here before we can configure it in Integration
      Response.
    * Here we configure how API Gateway responds to the client. We want to send
      a `Content-Type` header (so the client browser will see `text/html`).
    * Expand HTTP Status 200.
    * Remove the Content type model `application/json` under Response Body.
    * Under Response Headers, click Add Header.
    * Enter `Content-Type` and save.
  * Go back to Method Execution and go to Integration Response.
    * Here we configure how API Gateway receives the response from the Lambda
      function. We need to transform the `JSON.stringify()`'d body
      (which is a string containing HTML) into a raw string that a browser will
      recognize as HTML.
    * Expand Method response status 200.
    * Under Heading Mappings, click the Edit button beside Content-Type and set
      the value to `'text/html'`. Note the single quotes are required. Save it.
    * We don't need to set a charset in the Content-Type value. The HTML
      response includes a meta tag to set that.
    * Under Body Mapping Templates, remove `application/json`.
    * Under Body Mapping Templates, choose Add mapping template.
    * Enter `text/html` (no single quotes this time).
    * After you save this, a template editor should appear.
    * Enter this as the template: `$input.path('$')`
    * How does this template work? `$` is the root object. In our case it is
      the JavaScript string. `$input.path()` returns the object representation
      of its parameter, our String, now raw.
    * Click Save.
  * Under Actions near the top, click Deploy API.
    * You must choose a Deployment stage. You can create one. Name it whatever
      you like, such as `eggcorn`. The name will be part of the URL.
    * You will see an Invoke URL listed near the top of the page. This is the
      URL you can now make requests to to invoke your Lambda function.
    * Note if you make any changes to the API, you must Deploy API again to see
      them.


## Test
At this point we can make an HTTP request that reaches our Lambda function.

You can try this using cURL:

    curl -v -d 'name=horgh+washere&email=horgh%40example.com&text=hi%20there&url=https%3a%2f%2fwww.example.com' https://xxx.execute-api.us-west-2.amazonaws.com/eggcorn`

The URL is the Invoke URL for the API Gateway stage you configured in the prior
section.


## Final steps
We have a serverless application for posting comments. However, we still need a
frontend to it, a comments form. I've provided a sample form in
`sample-form.html` in this repository. You can use a similar form to add forms
into pages that you want to accept comments on. You can place these forms
anywhere you want to accept comments.

Once you have a form and you are receiving comments, you'll need to take the
comments out of the JSON (in the emails) and show them on a site.

I have a separate project that does this part for my blog. You can use a
similar system.


# TODO
  * Rate limiting (API Gateway configuration may suffice)
  * Captcha
