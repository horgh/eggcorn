This is an AWS Lambda function which accepts comments via HTTP and submits them
for moderation via SNS.

Its input is HTTP POST'd data (`application/x-www-form-urlencoded`) and its
output is an HTML page. This page thanks the person for commenting.

I use it for accepting comments on my blog posts.

It makes use of these AWS components:
  * API Gateway
  * Lambda
  * SNS


# Setup
  * Create an SNS topic.
  * Subscribe to the SNS topic with your email address using the Email-JSON
    type.
  * Copy `config.js.sample` to `config.js` and edit it.
    * You must set at least `aws_region` and `sns_arn`.
  * Run `make` and to create the Lambda function zip package.
  * Create a Lambda function in the AWS console.
    * Do not configure any Triggers.
    * Use the blank template.
    * Upload the function zip package.
    * Set runtime to Node.js 4.3
    * Set handler to `eggcorn.handler`
    * Role: You need to create a role, or use one you have. It will need these
      permissions:
      * `AWSLambdaBasicExecutionRole` (to be able to log)
      * `AmazonSNSFullAccess` (to be able to publish to SNS). You can be more
        fine grained than this policy, such as restricting to publishing only to
        a specific resource, if you like.
    * Memory can be 128 MB and timeout 3 seconds.
  * Go to API Gateway in the AWS Console.
  * Create a new API and configure it.
    * After creating the API, under Actions choose Create Method. Choose POST.
    * Set Integration type to Lambda Function
    * Set Lambda Region to the AWS region with your function.
    * Set Lambda Function to 'eggcorn'.
    * Clicking Save will prompt you about granting permission to use the Lambda
      function.
    * Go to Integration Request.
      * Here we are configuring how the API Gateway makes the request to the
        Lambda function. Primarily what we need to do is transform the request
        body from the client which is URL encoded into JSON. Lambda takes its
        input as a Javascript object.
      * Lambda functions take their input through through their event parameter.
        This must be a Javascript object. This means the input must be valid
        JSON. In Integration Request we will transform the
        `Content-Type: application/x-www-form-urlencoded` request into JSON.
        This means that the API Gateway transforms the request body into JSON
        before the request reaches the Lambda function.
      * If you want to learn more about the mapping the API Gateway can perform,
        see
        [here](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html#input-variable-reference)
      * Under Body Mapping templates, set Request body passthrough to Never. We
        only expect requests posted with forms.
      * Add a mapping template. Set Content-Type to
        `application/x-www-form-urlencoded`.
      * Set the template to this:
            {
            "body": "$input.body",
            "ip": "$context.identity.sourceIp",
            "useragent": "$context.identity.userAgent"
            }
      * How does this template work? `$input.body` is the raw request payload.
        We make a JSON object with one property, `body`. It is safe to double
        quote the raw payload and set it as a property as a well formed
        `application/x-www-form-urlencoded` string percent encodes '"'
        characters. We also pass in the source IP and the source User-Agent.
      * This means our Lambda function receives its `event` parameter with the
        property `body` set to the raw body. Inside the Lambda function we can
        parse and validate it.
    * Go to Integration Response.
      * Here we are configuring how API Gateway receives the response from the
        Lambda function. Primarily what we need to do is transform the
        stringified JSON in the response body into a raw string that a browser
        will recognize as HTML.
      * Expand Method response status 200.
      * Under Heading Mappings, click the Edit button beside Content-Type and
        set the value to 'text/html'. Note the single quotes are required. We
        don't need to set a charset here. The HTML response will include a meta
        tag to set that.
      * Remove application/json from under Body Mapping Templates.
      * Now we want to do here is convert the response from Lambda into one
        suitable for the client's browser.
      * The Lambda function returns a string containing HTML. However, this
        string has had `JSON.stringify()` called on it, so it looks like a
        Javascript string. We need to turn it back into a raw string.
      * Expand the Method response status 200
      * Under Body Mapping Templates, choose Add mapping template
      * Enter text/html (no single quotes)
      * A template editor should appear. Enter `$input.path('$')`
      * How does this transformation work? `$` is the root object. In our case
        it is the Javascript String. `$input.path()` returns the object
        representation of its parameter, our String.
    * Go to Method Response.
      * Here we are configuring how API Gateway responds to requests from a
        client.
      * Expand 200.
      * Remove the Content type model (application/json) under Response Body.
      * Add Header to Response Headers: `Content-Type`. We want to pass through
        the Content-Type header to the client.
    * Under Actions click Deploy API.
      * You must choose a Deployment stage. You can create one. Name it whatever
        you like, such as 'eggcorn'.
      * You will see an Invoke URL listed. This is the API Gateway URL you can
        make requests to to invoke your Lambda function.
    * Note if you make any changes to the API, you must Deploy API again to see
      them.
  * Test making a request. You should receive HTML and an email from SNS.
    * Using cURL:
      `curl -v -d 'name=horgh+washere&email=horgh%20example.com&text=hi%20there&url=https%3a%2f%2fwww.example.com' https://xxx.execute-api.us-west-2.amazonaws.com/eggcorn`
      where the URL is the Invoke URL for your stage.
