

function SearchMovie() {
    let value = document.getElementById('moviename').value;
    let button = document.getElementById('moviebutton');
    button.innerHTML = "Searching...";
    if (value != "") {
        let moviegrid = document.getElementById('movies');
        while (moviegrid.firstChild) {
            moviegrid.removeChild(moviegrid.firstChild);
        }
        MakeRequest("/KliveMovie/SearchForMovie?moviename=" + value).then(response => {
            let json = JSON.parse(response);
            for(let i = 0; i<json.length; i++){
                let json2 = json[i];
                let movie = document.createElement('div');
                movie.className="movieImage";
                movie.setAttribute("name", JSON.stringify(json2));
                movie.setAttribute("onclick", "DownloadMovie(this.getAttribute('name'))")
                moviegrid.appendChild(movie);
                let image = document.createElement("img");
                if(json2.ImageURL==""){
                    image.src="images/noimage.png";
                    image.style="width: 150px; height: 175px; filter: invert();";
                }
                else{
                    image.src=json2.ImageURL;
                    image.style="width: 150px; height: 175px;";
                }
                movie.appendChild(image);
                let text = document.createElement('span');
                text.style="font-weight: bold; align-self: center;";
                text.innerHTML=json2.Title;
                movie.appendChild(text);
            }
            button.innerHTML = "Search";
        });
    }
    else {
        button.innerHTML = "Movie Name can not be empty.";
        setTimeout(function () {
            button.innerHTML = "Search";
        }, 1000)
    }
}

function DownloadMovie(json) {
    let info = JSON.parse(json);
    swal("Do you want to download "+info.Title+"?", {
        buttons: {
            cancel: "No",
            gopost: {
                text: "Yes",
                value: "download",
            }
        },
    }).then((value) => {
        let button = document.getElementById('moviebutton');
        if(value=="download"){
            let formdata = new FormData();
            formdata.append("kliveMovieJson", json);
            var xhr = new XMLHttpRequest();
            xhr.open("POST", api+"/klivemovie/downloadmovie", true);
            xhr.send(formdata);
            xhr.onreadystatechange = function () {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    button.innerHTML = "Movie is downloading, KliveBot will message Klives when it is done.";
                    setTimeout(function () {
                        button.innerHTML = "Search";
                    }, 2000)
                }
                else{
                    button.innerHTML = "Failed.";
                    setTimeout(function () {
                        button.innerHTML = "Search";
                    }, 2000)
                }
            }
        }
    })
}