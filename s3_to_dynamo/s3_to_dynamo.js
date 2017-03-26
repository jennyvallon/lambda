//takes text files, reads them, saves to Dynamo DB

var util=require('util'); //handles control of logging
var AWS=require('aws-sdk'); //does not need to be installed, is made available in Lambda
var s3=new AWS.S3();

//everytime a text file is uploaded s3_to-dynamo.handler is fired ==> triggered by s3 event added at bucket level
exports.handler = function(event, context, callback) { //callback function handles errors
    var log={};
    log.event={};
    log.event=event;
    log.err={};
    log.dynamo={};
    log.s3={};
    log.obj={};
    log.result={};
    var obj={};
    
    obj.key={};//ifo about file name ==> prefix/prefix/key.extension
    obj.key.full=event.Records[0].s3.object.key; //prefix/prefix/key.extension
    obj.key.array=obj.key.full.split("/");
    obj.key.name= obj.key.array[obj.key.array.length-1];
    obj.key.nameMinusExt=obj.key.name.split(".")[0];
    obj.key.prefix=obj.key.array;
    obj.key.prefix.pop();
    obj.bucket=event.Records[0].s3.bucket.name;
    obj.path=obj.bucket+"/"+obj.key.full;
    obj.fileType="";
    obj.body="";
    
    
    // Get file type
    var typeMatch = obj.key.name.match(/\.([^.]*)$/); //break up fileName is any of these characters exist
    if (!typeMatch) {
        log.obj=obj;
        log.err={message:obj.path+" does not have an extension"};
        callback(log);
        return;
    }
    
    //Validate that it's text file
    obj.fileType = typeMatch[1];
    if (obj.fileType !== "rtf" && obj.fileType !== "txt" && obj.fileType !== "text") {
        log.obj=obj;
        log.err={message:obj.path+" unsupported file type: "+obj.fileType};
        callback(log);
        return;
    }
    
    new Promise(//get file
        function (resolve){
            var params={Bucket:obj.bucket,Key:obj.key.full};
            log.s3.params=params;
            s3.getObject(params, function(err, dataObj) {
                if (err){  
                    log.error={message:"There was an error retrieving "+ obj.path +" from s3"};
                    callback(log);
                    return;
                } 
                else {
                    log.s3.result=dataObj;
                    resolve(dataObj);
                }
            });
        }
    ).then(function(data){
        obj.body=data.Body.toString('utf-8'); //read file
        
        new Promise( //push to Dynamo
            function(resolve){
                var dynamo=new AWS.DynamoDB();
                var params={
                    ExpressionAttributeNames: {
                        "#T": obj.key.prefix[1]
                    }, 
                    ExpressionAttributeValues: {
                        ":t": {S:obj.body}
                    },
                    TableName: obj.bucket,
                    Key:{
                        'Project':{'S':obj.key.prefix[0]},
                        'Asset':{'S':obj.key.nameMinusExt}
                    },
                    ReturnValues:"ALL_NEW",
                    UpdateExpression: "SET #T = :t"
                };
                log.dynamo.params=params;
                log.obj=obj;
                dynamo.updateItem(params, function (err, result) {
                    if (err){ // an error occurred
                        log.err=err;
                        callback(err); 
                        return;
                    }
                    else{// successful response
                        log.dynamo.result=result;
                        log.result=result;
                        resolve(log);
                    }
                }); 
            }
        ).then(function(log){
            callback(null,log);
        });
    });
};