function LoadAllInRawStore() {
  //Make an api get request
  let responsetext = "";
  fetch(api+"/storage/GetAllFilesInRawStore")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      let responsejson = JSON.parse(responsetext);
      //Foreach value in responsejson create new a element in the filelist div
      responsejson.forEach(element => {
        let newElement = document.createElement("a");
        newElement.setAttribute("name", element);
        newElement.setAttribute("onclick", "LoadFile(this.name)");
        //height: 2vw;
        newElement.style.height = "2vw";
        //parse filename from element path
        let filename = element.split("\\");
        filename = filename[filename.length - 1];
        newElement.innerHTML = filename;
        document.getElementById("filelist").appendChild(newElement);
      });
    }
      , (error) => { console.log(error); })
};

function DeleteFile(name) {
  let responsetext = "";
  fetch(api+"/storage/DeletePath?p=" + name)
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        console.log("Deleted");
        //clear all elements in filelist
        let filelist = document.getElementById('filelist');
        if (filelist.firstChild != null) {
          while (filelist.firstChild) {
            filelist.removeChild(filelist.firstChild);
          }
          LoadAllInRawStore();
        }
      }
    }
      , (error) => { console.log(error); })
}

function LoadFile(name) {
  let responsetext = "";
  fetch(api+"/storage/ReadTextFile?p=" + name)
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      console.log(responsetext);
      document.getElementById('contenttext').innerHTML = responsetext.replace("\n", "<br><br>");
      document.getElementById("total").style.visibility = "visible";
      document.getElementById('deletebutton').setAttribute('name', name);
      document.getElementById('downloadbutton').setAttribute('name', name);
      let filename = name.split("\\");
      filename = filename[filename.length - 1];
      document.getElementById('downloadbutton').innerHTML="Download "+filename;
      document.getElementById('deletebutton').innerHTML="Delete "+filename;
    });
}

function DownloadFile(name){
  alert("I didn't make this yet :(");
}

function UpdateStatistics() {
  let responsetext = "";
  fetch(api+"/v1/Metrics")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      let responsejson = JSON.parse(responsetext);
      document.getElementById('CPU').innerHTML = "CPU Usage: " + responsejson.CPUPercent + "%";
      document.getElementById('RAM').innerHTML = "RAM Usage: " + responsejson.MemoryUsed + "%";
    });
}

function ReceiveScreenshot(element) {
  document.getElementById("screenshot").setAttribute('src', api+"/v1/GetScreenshot");
}

function RestartServer() {
  document.getElementById('restartserverbutton').innerHTML = "Restarting...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/RestartServer")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('restartserverbutton').innerHTML = "Done.";
        LogOut();
      }
    });
}

function RawStore() {
  document.getElementById('rawstorebutton').innerHTML = "Storing...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/storage/RawStore?t=" + document.getElementById('rawstorefield').value + "&n=" + document.getElementById('rawstorenamefield').value)
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('rawstorebutton').innerHTML = "Done.";
        //set delay for 2 seconds
        setTimeout(() => {
          document.getElementById('rawstorebutton').innerHTML = "Store";
          //clear all elements in filelist
          let filelist = document.getElementById('filelist');
          if (filelist.firstChild != null) {
            while (filelist.firstChild) {
              filelist.removeChild(filelist.firstChild);
            }
          }
          LoadAllInRawStore();
        }, 1000);
      }
    });
}

function ShutdownServer() {
  document.getElementById('shutdownserverbutton').innerHTML = "Shutting down...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/ShutdownServer")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('shutdownserverbutton').innerHTML = "Shutting down.";
        LogOut();
      }
    });
}

function TurnOffBot() {
  document.getElementById('shutdownbutton').innerHTML = "Shutting Down...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/TurnOffBot")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('shutdownbutton').innerHTML = "Done.";
        LogOut();
      }
    });
}
function RestartBot() {
  document.getElementById('restartbotbutton').innerHTML = "Restarting Bot...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/RestartBot")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('restartbotbutton').innerHTML = "Done.";
        LogOut();
      }
    });
}

function UpdateBot() {
  document.getElementById('updatebotbutton').innerHTML = "Updating...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/UpdateBot")
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('updatebotbutton').innerHTML = "Done.";
        LogOut();
      }
    });
  LogOut();
}

function SpeakerStream() {
  document.getElementById('speakerbutton').innerHTML = "Sending...";
  //Make an api get request
  let responsetext = "";
  fetch(api+"/v1/Speaker?t=" + document.getElementById('speakerfield').value)
    .then(res => res.text())
    .then((data) => {
      responsetext = data;
      if (responsetext == "OK") {
        document.getElementById('speakerbutton').innerHTML = "Done.";
        //set delay for 2 seconds
        setTimeout(() => {
          document.getElementById('speakerbutton').innerHTML = "Send";
        }, 1000);
      }
    });
}

function LogOut() {
  window.location.replace("../index.html");
}