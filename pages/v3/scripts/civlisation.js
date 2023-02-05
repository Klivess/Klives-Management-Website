let civData;
let worldMap;
function OnLoadCivPage(){
    worldMap = document.getElementById('map');
    ConstantUpdates();
}

function ConstantUpdates(){

    var ctx = worldMap.getContext("2d");
    ctx.font = "48px serif";
    ctx.fillStyle="white";
    textLength = ctx.measureText("Loading map...")
    ctx.fillText("Loading map...", (worldMap.width/2)-(textLength.width/2), (worldMap.height/2)-(textLength.height/2));
    MakeRequest("/civilisation/GetCivilisationAnalytics").then(response => {
        let json = JSON.parse(response);
        civData=json;
        document.getElementById('civPopulation').innerHTML="Population: "+json.Population;
        document.getElementById('civMoneyCirculation').innerHTML="Money In Circulation: "+json.MoneyInCirculation;
        document.getElementById('civFoodCirculation').innerHTML="Food In Circulation: "+json.FoodInCirculation;
        document.getElementById('civDeaths').innerHTML="Deaths: "+json.Deaths;
        document.getElementById('civSizeX').innerHTML="World Size X: "+json.worldSizeX;
        document.getElementById('civSizeY').innerHTML="World Size Y: "+json.worldSizeY;
        let date = new Date(json.time.CurrentDateTime);
        document.getElementById('civTime').innerHTML="Civilisation Date: "+date.toLocaleDateString()+" "+date.toLocaleTimeString();

        ctx.clearRect(0, 0, worldMap.width, worldMap.height);
        //Load Map
        ctx.fillStyle = "#001327";
        ctx.fillRect(0, 0, worldMap.width, worldMap.height);
        
        for (let index = 0; index < json.AllHumanProfiles.length; index++) {
            const element = json.AllHumanProfiles[index];
            drawCircle(ctx, ConvertXWorldCoordinateToCanvasCoordinate(element.Location.latitude),
            ConvertYWorldCoordinateToCanvasCoordinate(element.Location.longitude), 3, "#D72638", 3);  
        }
    });
}

function ConvertXWorldCoordinateToCanvasCoordinate(x){
    let wrldX = civData.worldSizeX;
    let scale = worldMap.width / wrldX;
    return x * scale;
}
function ConvertYWorldCoordinateToCanvasCoordinate(y){
    let wrldY = civData.worldSizeY;
    let scale = worldMap.height / wrldY;
    return y * scale;
}

function drawCircle(ctx, x, y, radius, fill, stroke, strokeWidth) {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false)
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    if (stroke) {
      ctx.lineWidth = strokeWidth
      ctx.strokeStyle = stroke
      ctx.stroke()
    }
  }