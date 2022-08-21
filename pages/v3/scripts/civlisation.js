function OnLoadCivPage(){
    setInterval(() => {
        MakeRequest("/civilisation/GetCivilisationAnalytics").then(response => {
            let json = JSON.parse(response);
            document.getElementById('civPopulation').innerHTML="Population: "+json.Population;
            document.getElementById('civMoneyCirculation').innerHTML="Money In Circulation: "+json.MoneyInCirculation;
            document.getElementById('civFoodCirculation').innerHTML="Food In Circulation: "+json.FoodInCirculation;
            document.getElementById('civDeaths').innerHTML="Deaths: "+json.Deaths;
            document.getElementById('civSizeX').innerHTML="World Size X: "+json.worldSizeX;
            document.getElementById('civSizeY').innerHTML="World Size Y: "+json.worldSizeY;
        });
    }, 2000);
}