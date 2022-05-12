//get api response from url
function GetResponse(url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onload = function () {
            if (this.status == 200) {
                resolve(this.response);
                console.log(this.response);
            } else {
                var error = new Error(this.statusText);
                error.code = this.status;
                reject(error);
            }
        };
        xhr.onerror = function () {
            reject(new Error("Network Error"));
        };
        xhr.send();
    });
}

function TranslateText() {
    try {
        document.getElementById("translated").innerHTML = "";
        let alphabet = "abcdefghijklmnopqrstuvwxyz".toUpperCase();
        //get value from jsontext element and parse to json object
        var jsontext = document.getElementById("jsontext").value;
        let onquestion = 0;
        let actualfinalhaha = "";
        let json = JSON.parse(jsontext);
        json.data.forEach(element => {
            if (element.correct==true) {
                console.log(onquestion+" this is correct.")
                onquestion++;
                element.answer.forEach(element2 => {
                    //is element2.text a array
                    if (element2.text.constructor === Array) {
                        if (element2.tag.toString() == "multianswer") {
                            element2.text.forEach(element3 => {
                                actualfinalhaha += " " + alphabet.substring(element2.total - 1, element2.total) + " |";
                            });
                        }
                        else {
                            actualfinalhaha += " " + element2.text + " |";
                        }
                    }
                    else {
                        actualfinalhaha += " " + element2.text + " |";
                    }
                });
                document.getElementById("translated").innerHTML += "Question " + onquestion.toString() + ": | " + actualfinalhaha + "<br><br>";
                actualfinalhaha = "";
            }
            else {
                onquestion++;
            }
        });
    }
    catch (err) {
        document.getElementById("translated").innerHTML = "An error has occured: " + err;
    }
}