function ReloadData(){
    let downloadedMovies = document.getElementById('downloadedmovies');
    while (downloadedMovies.firstChild) {
        downloadedMovies.removeChild(downloadedMovies.firstChild);
    }
    let ongoingdownloads = document.getElementById('currentdownloads');
    while (ongoingdownloads.firstChild) {
        ongoingdownloads.removeChild(ongoingdownloads.firstChild);
    }
    LoadMoviesPage();
}

function LoadMoviesPage() {
    let downloadedMovies = document.getElementById('downloadedmovies');
    MakeRequest("/KliveMovie/GetAllDownloadedMovies").then(response => {
        let json = JSON.parse(response);
        for (let i = 0; i < json.length; i++) {
            ConstructMovieIntoGrid('downloadedmovies', JSON.stringify(json[i]));
        }
    });
    MakeRequest("/KliveMovie/GetOngoingMovieDownloads").then(response => {
        let ongoingdownloads = document.getElementById('currentdownloads');
        let json1 = JSON.parse(response);
        for (let i = 0; i < json1.length; i++) {
            let json = json1[i];
            let ongoingbox = document.createElement('div');
            ongoingbox.className="ongoingdownload";
            let title = document.createElement('span');
            title.style="font-size: 1.2vw;";
            title.innerHTML=json.Movie.Title;
            let date = new Date(json.DownloadStart);
            let datetime = document.createElement('span');
            datetime.style="font-size: 1vw; color: var(--secondary);";
            datetime.innerHTML="Downloading since "+date.toLocaleString();
            let iscompleted = document.createElement('span');
            iscompleted.style="font-size: 1vw; color: var(--secondary);";
            iscompleted.innerHTML="Is Completed: "+json.IsCompleted;
            ongoingbox.appendChild(title);
            ongoingbox.appendChild(datetime);
            ongoingbox.appendChild(iscompleted);
            ongoingdownloads.appendChild(ongoingbox);
        }
    });
}

function ConstructMovieIntoGrid(gridID, movieJSON) {
    let moviegrid = document.getElementById(gridID);
    let json2 = JSON.parse(movieJSON);
    let movie = document.createElement('div');
    movie.className = "movieImage";
    movie.setAttribute("name", JSON.stringify(json2));
    moviegrid.appendChild(movie);
    let image = document.createElement("img");
    if (json2.ImageURL == "") {
        image.src = "images/noimage.png";
        image.style = "width: 150px; height: 175px; filter: invert();";
    }
    else {
        image.src = json2.ImageURL;
        image.style = "width: 150px; height: 175px;";
    }
    movie.appendChild(image);
    let text = document.createElement('span');
    text.style = "font-weight: bold; align-self: center;";
    text.innerHTML = json2.Title;
    movie.appendChild(text);
    return movie;
}

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
            for (let i = 0; i < json.length; i++) {
                let element = ConstructMovieIntoGrid('movies', JSON.stringify(json[i]));
                element.setAttribute("onclick", "DownloadMovie(this.getAttribute('name'))");
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
    swal("Do you want to download " + info.Title + "?", {
        buttons: {
            cancel: "No",
            gopost: {
                text: "Yes",
                value: "download",
            }
        },
    }).then((value) => {
        let button = document.getElementById('moviebutton');
        button.innerHTML = "Requesting...";
        if (value == "download") {
            let formdata = new FormData();
            formdata.append("kliveMovieJson", json);
            var xhr = new XMLHttpRequest();
            xhr.open("POST", api + "/klivemovie/downloadmovie", true);
            xhr.send(formdata);
            xhr.onreadystatechange = function () {
                if (xhr.readyState == 4 && xhr.status == 200) {
                    button.innerHTML = "Movie is downloading, KliveBot will message Klives when it is done.";
                    setTimeout(function () {
                        button.innerHTML = "Search";
                    }, 2000)
                    setTimeout(function () {
                        ReloadData();
                    }, 500)
                }
                else {
                    button.innerHTML = "Failed.";
                    setTimeout(function () {
                        button.innerHTML = "Search";
                    }, 2000)
                }
            }
        }
        else{
            button.innerHTML = "Search";
        }
    })
}