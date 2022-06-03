let uploadingFile = false;
let selectedpreviousborder = "";
let selected = "";
let selectedFolder = "";

function GetStorageData() {
    MakeRequest("/storage/GetStorageMetrics").then(response => {
        let storbox = document.getElementById('storageinfobox');
        let json = JSON.parse(response);
        let totalheight = 0;
        //foreach item in array of json
        for (let i = 0; i < json.length; i++) {
            let item = json[i];
            if (item.Name != "E:\\") {
                let newbox = document.createElement('div');
                newbox.className = "driveinfo";
                let driveName = document.createElement('span');
                driveName.innerHTML = "Drive " + item.Name + ": ";
                newbox.appendChild(driveName);
                let driveDetail = document.createElement('span');
                driveDetail.style = "z-index: 7; position: absolute; margin-top: 27px; font-size: 16px;";
                driveDetail.innerHTML = (item.GigabytesTotal - item.GigabytesFree).toString() + "GB/" + item.GigabytesTotal.toString() + "GB";
                newbox.appendChild(driveDetail);
                let newDiv = document.createElement('div');
                newDiv.style = "display: grid;"
                newbox.appendChild(newDiv);
                var p = Math.floor((item.MegabytesTotal - item.MegabytesFree) / item.MegabytesTotal * 100);
                let progressBarTotal = document.createElement('div');
                progressBarTotal.style = "width: 100%; height: 20px; background-color: #292929; z-index: 5;"
                    + "background-image: linear-gradient(to right, rgba(0,0,0,0) " + p + "%, #474747 25%);";
                newDiv.appendChild(progressBarTotal);
                storbox.appendChild(newbox);
                //foreach child in storbox
                //get height of child
                //add height to totalheight
                Array.from(storbox.children).forEach((child, index) => {
                    totalheight += parseInt(child.clientHeight) + 10;
                });
                console.log(totalheight);
                storbox.style.height = totalheight + "px";
            }
        }
    });
    LoadAllCloudFiles();
}

function LoadAllCloudFiles() {
    //Loading cloud storage
    MakeRequest("/storage/GetAllFilesInCloudStorage").then(response => {
        let cloudboxx = document.getElementById('files');
        let json = JSON.parse(response);
        //foreach item in json array
        for (let i = 0; i < json.length; i++) {
            let box = document.createElement('button');
            box.className = "kbutton";
            box.style = "height: 50px; width: 100%; font-size: 15px; margin-bottom: 3px; color: #ffffff; font-size: 1vw;  text-transform: none;";
            if (json[i].filename.endsWith(".txt")) {
                box.style.border = "2px solid yellow";
            }
            if (json[i].filename.includes('.') != true) {
                box.style.border = "2px solid aqua";
            }
            box.id = json[i].filepath;
            box.setAttribute("filename", json[i].filename);
            box.innerHTML = json[i].filename;
            box.setAttribute("onclick", "OpenCloudFile(this.id, this.getAttribute('filename'))");
            cloudboxx.appendChild(box);
        }
    });
}

function UploadFile(uploadbuttonid) {
    let file = document.createElement("input");
    file.type = "file";
    file.setAttribute("multiple", "multiple");
    let buttontext = document.getElementById(uploadbuttonid);
    file.click();
    let flavour = "KliveCloud";
    if (selectedFolder != "")
        flavour = selectedFolder;
    file.onchange = function () {
        uploadingFile = true;
        swal("Confirmation", {
            text: "You are uploading " + file.files.length + " files to folder '" + flavour + "'",
            buttons: {
                cancel: "No.",
                gopost: {
                    text: "Yes.",
                    value: "YES",
                },
            },
        }).then((value) => {
            if (value == "YES") {
                for (let i = 0; i < file.files.length; i++) {
                    let formData = new FormData;
                    formData.append("files", file.files[i]);
                    var url = api + "/storage/UploadFileToCloudStorage?p=" + selectedFolder;
                    var xhr = new XMLHttpRequest();
                    //xhr upload 
                    xhr.open("POST", url, true);
                    xhr.upload.addEventListener("progress", e => {
                        var p = Math.floor(e.loaded / e.total * 100);
                        buttontext.innerHTML = "Uploading " + p + "%<br>Uploading " + i + " of " + file.files.length;
                        if (p == 100) {
                            buttontext.innerHTML = "Finalizing..";
                        }
                    })
                    //xhr.setRequestHeader("Content-Type","multipart/form-data");
                    xhr.send(formData);
                    xhr.onreadystatechange = function () {
                        if (this.readyState == 4 && this.status == 200) {
                            buttontext.innerHTML = "Upload File";
                            let grid = document.getElementById("files");
                            while (grid.firstChild) {
                                grid.removeChild(grid.firstChild);
                            }
                            LoadAllCloudFiles();
                        }
                    }
                }
                file.value = "";
                uploadingFile = false;
                file.remove();
            }
        })
    }
}

function OpenCloudFile(file, filename) {
    let foldergrid = document.getElementById('foldergrid');
    foldergrid.style.gridTemplateColumns = "1fr";
    selectedFolder = "";
    if (file.includes('.') != true) {
        var hasChild = foldergrid.querySelector("#filegridpathed") != null;
        if (hasChild)
            foldergrid.removeChild(document.getElementById('filegridpathed'));
        foldergrid.style.gridTemplateColumns = foldergrid.style.gridTemplateColumns.replace('2fr', '1fr') + " 2fr";
        let newfilegrid = document.createElement('div');
        newfilegrid.className = "filesgrid";
        newfilegrid.id = "filegridpathed";
        foldergrid.appendChild(newfilegrid);
        selectedFolder = file;
        MakeRequest('/storage/GetAllFilesInCloudStorage?p=' + file).then(response => {
            let json = JSON.parse(response);
            for (let i = 0; i < json.length; i++) {
                let box = document.createElement('button');
                box.className = "kbutton";
                box.style = "height: 50px; width: 100%; font-size: 15px; margin-bottom: 3px; color: #ffffff; font-size: 1vw;  text-transform: none;";
                if (json[i].filename.endsWith(".txt")) {
                    box.style.border = "2px solid yellow";
                }
                if (json[i].filename.includes('.') != true) {
                    box.style.border = "2px solid aqua";
                }
                box.id = json[i].filepath;
                box.setAttribute("filename", json[i].filename);
                box.innerHTML = json[i].filename;
                box.setAttribute("onclick", "OpenCloudFile(this.id, this.getAttribute('filename'))");
                newfilegrid.appendChild(box);
            }
        })
    }
    else {
        MakeRequest('/storage/GetFileInfo?p=' + file).then(response3 => {
            let json = JSON.parse(response3);
            let contenttext = "File Name: " + filename + "\nFilepath: " + filename + "\n\n";
            //If Kilobyte
            if (json.FilesizeB > 1024 && json.FilesizeKB < 1024) {
                contenttext += "Filesize: " + Math.round(json.FilesizeKB) + "KB";
            }
            //If Megabyte
            else if (json.FilesizeKB >= 1024 && json.FilesizeMB < 1024) {
                contenttext += "Filesize: " + Math.round(json.FilesizeMB) + "MB";
            }
            //If Gigabyte
            else if (json.FilesizeMB >= 1024) {
                contenttext += "Filesize: " + Math.round(json.FilesizeGB) + "GB";
            }
            //If Bytes
            else {
                contenttext += "Filesize: " + Math.round(json.FilesizeB) + "B";
            }
            let uploaded = new Date(json.ModifiedDate);
            let created = new Date(json.CreationDate);
            contenttext += "\nUploaded: " + uploaded.toLocaleString() + "\nFile Created: " + created.toLocaleString();
            if (filename.endsWith(".txt")) {
                MakeRequest("/storage/ReadFile?p=" + file).then(response => {
                    contenttext = contenttext + "\n\nContent:\n" + response;
                    swal(contenttext, {
                        buttons: {
                            cancel: "OK",
                            gopost: {
                                text: "Download File",
                                value: "download",
                            },
                            delpost: {
                                text: "Delete File",
                                value: "delete",
                            }
                        },
                    }).then((value) => {
                        if (value == "download") {
                            DownloadFile(file, filename);
                        }
                        else if (value == "delete") {
                            DeleteFile(file);
                        }
                    })
                });
            }
            else {
                swal(contenttext, {
                    buttons: {
                        cancel: "OK",
                        gopost: {
                            text: "Download File",
                            value: "download",
                        },
                        delpost: {
                            text: "Delete File",
                            value: "delete",
                        }
                    },
                }).then((value) => {
                    if (value == "download") {
                        DownloadFile(file, filename);
                    }
                    else if (value == "delete") {
                        DeleteFile(file);
                    }
                });
            }
        });
    }
}

function NewFolder() {
    swal({
        text: 'Folder Name',
        content: "input",
        button: {
            text: "Search!",
            closeModal: false,
        },
    }).then(result => {
        MakeRequest('/storage/CreateNewCloudFolder?name=' + result).then(response => {
            if (response == "OK") {
                let grid = document.getElementById("files");
                while (grid.firstChild) {
                    grid.removeChild(grid.firstChild);
                }
                swal("Created!");
                LoadAllCloudFiles();
            }
            if (response.includes("ERROR")) {
                swal(response);
            }
        })
    })
}
function ClearFolder(path) {
    swal({
        text: 'Delete and clear all contents of folder?',
        buttons: {
            cancel: "No.",
            button: {
                text: "Yes.",
                value: "YES",
                closeModal: false,
            },
        }
    }).then(result => {
        if (result == "YES") {
            MakeRequest('/storage/ClearCloudFolder?path=' + path).then(response => {
                if (response == "OK") {
                    swal("Deleted.");
                    let grid = document.getElementById("files");
                    while (grid.firstChild) {
                        grid.removeChild(grid.firstChild);
                    }
                    LoadAllCloudFiles();
                }
                if (response.includes("ERROR")) {
                    swal(response);
                    let grid = document.getElementById("files");
                    while (grid.firstChild) {
                        grid.removeChild(grid.firstChild);
                    }
                    LoadAllCloudFiles();
                }
            })
        }
    })
}

function DownloadScreenshot(filename) {
    //make post request 
    var url = api + "/storage/DownloadScreenshot";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = 'blob';
    xhr.onload = function (res) {
        if (this.status === 200) {
            var type = xhr.getResponseHeader('Content-Type');
            var blob = new Blob([this.response], { type: type });
            if (typeof window.navigator.msSaveBlob !== 'undefined') {
                /*
                 * For IE
                 * >=IE10
                 */
                window.navigator.msSaveBlob(blob, filename);
            } else {
                /*
                 * For Non-IE (chrome, firefox)
                 */
                var URL = window.URL || window.webkitURL;
                var objectUrl = URL.createObjectURL(blob);
                if (filename) {
                    var a = document.createElement('a');
                    if (typeof a.download === 'undefined') {
                        window.location = objectUrl;
                    } else {
                        a.href = objectUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }
                } else {
                    window.location = objectUrl;
                }
            }
        }
    }
    xhr.send();
}

function DownloadFile(file, filename) {
    //make post request 
    let formData = new FormData;
    formData.append("filename", file);
    var url = api + "/storage/DownloadFile";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = 'blob';
    xhr.onload = function (res) {
        if (this.status === 200) {
            var type = xhr.getResponseHeader('Content-Type');
            var blob = new Blob([this.response], { type: type });
            if (typeof window.navigator.msSaveBlob !== 'undefined') {
                /*
                 * For IE
                 * >=IE10
                 */
                window.navigator.msSaveBlob(blob, filename);
            } else {
                /*
                 * For Non-IE (chrome, firefox)
                 */
                var URL = window.URL || window.webkitURL;
                var objectUrl = URL.createObjectURL(blob);
                if (filename) {
                    var a = document.createElement('a');
                    if (typeof a.download === 'undefined') {
                        window.location = objectUrl;
                    } else {
                        a.href = objectUrl;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }
                } else {
                    window.location = objectUrl;
                }
            }
        }
    }
    xhr.send(formData);
}

function DeleteFile(file) {
    MakeRequest("/storage/DeleteFileInCloudStorage?p=" + file).then(response => {
        let grid = document.getElementById("files");
        while (grid.firstChild) {
            grid.removeChild(grid.firstChild);
        }
        LoadAllCloudFiles();
    });
}