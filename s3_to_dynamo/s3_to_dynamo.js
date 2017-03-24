//takes text files, reads them, saves to Dynamo DB

var util=require('util'); //handles control of logging
var AWS=require('aws-sdk'); //does not need to be installed, is made available in Lambda
var s3=new AWS.S3();

//everytime a text file is uploaded s3_to-dynamo.handler is fired ==> triggered by s3 event added at bucket level
exports.handler = function(event, context, callback) { //callback function handles errors
    console.log("Here is the info about the triggering event:");
    console.log(util.inspect(event, {depth: null,colors:true}));
    
    var obj={};
    
    obj.key={};//ifo about file name ==> prefix/prefix/key.extension
    obj.key.full=event.Records[0].s3.object.key; //prefix/prefix/key.extension
    obj.key.array=obj.key.full.split("/");
    obj.key.name= obj.key.array[obj.key.array.length-1];
    obj.key.nameMinusExt=obj.key.name.split(".")[0];
    obj.key.prefix=obj.key.array.pop();
    obj.bucket=event.Records[0].s3.bucket.name;
    obj.path=obj.bucket+"/"+obj.key.full;
    obj.fileType="";
    obj.body="";
    
    
    // Get file type
    var typeMatch = obj.key.name.match(/\.([^.]*)$/); //break up fileName is any of these characters exist
    if (!typeMatch) {
        callback("${obj.path} does not have an extension.");
        return;
    }
    
    //Validate that it's text file
    obj.fileType = typeMatch[1];
    if (obj.fileType !== "rtf" && obj.fileType !== "txt" && obj.fileType !== "text") {
        callback('${obj.path} unsupported file type: '+ obj.fileType);
        return;
    }
    
    new Promise(//get file
        function (resolve){
            var params={Bucket:obj.bucket,Key:obj.key.full};
            s3.getObject(params, function(err, dataObj) {
                if (err){  
                    callback("There was an error retrieving "+ obj.path +" from s3");
                    console.log(err);
                    return;
                } 
                else resolve(dataObj); 
            });
        }
    ).then(function(data){
        obj.body=data.Body.toString('base64'); //read file
        new Promise( //push to Dynamo
            function(){
                var dynamo=new AWS.DynamoDB();
                 var params={
                    TableName: obj.bucket,
                    Key:{
                        'Project':{'S':obj.key.prefix[0]} //SHOULD BE OBJ.PREFIX
                    },
                    UpdateExpression: "SET :a = :b", 
                    ExpressionAttributeValues: {
                        ":a":obj.key.prefix[1][obj.nameMinusExt],
                        ":b": obj.body.toString()
                    }
                 };
                dynamo.updateItem(params, function (err, result) {
                    if (err){ // an error occurred
                        callback('There was an error updating ${params.TableName}'); 
                        console.log(err);
                        return;
                    }
                    else{// successful response
                        console.log('Successfully updated '+params.Key.Asset+' in '+ params.TableName);
                        console.log('Results of this query');
                        console.log(result);
                        resolve();
                    }
                }); 
            }
        ).then(function(){
            callback(null,"message");
        });
    });
};