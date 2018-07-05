function guessZipCode(){
  // always use wunderground API for geolookup
  // only valid equivalent is GET v3/location/search
  // TODO: use TWC API GET v3/location/search instead of wunderground geolookup
  fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/geolookup/q/autoip.json`)
  .then(function(response) {
    //check for error
    if (response.status !== 200) {
      console.log("zip code request error");
      return;
    }
    response.json().then(function(data) {
      getElement("zip-code-text").value = data.location.zip;
    });
  })
}

function fetchAlerts(){
  var alertCrawl = "";
  // again, always use wunderground for fetching alerts
  // two api calls are required for one alert
  // one: GET v1/alerts
  //        this gets all the alerts issued
  // two: GET v1/alert/:detailKey/details.json
  //        this gets the details of the alert
  // will think of a solution later
  // TODO: Use v1/alerts and v1/alert to grab alerts from TWC
  fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/alerts/q/${zipCode}.json`)
  .then(function(response) {
    if (response.status !== 200) {
      console.log("forecast request error");
      return;
    }
    response.json().then(function(data) {
      for(var i = 0; i < data.alerts.length; i++){
        /* Take the most important alert message and set it as crawl text
           This will supply more information i.e. tornado warning coverage */
        alertCrawl = alertCrawl + " " + data.alerts[i].message.replace("...", "");

        // ignore special weather statements
        if(data.alerts[i].type == "SPE"){
          continue;
        }
        alerts[i] = data.alerts[i].message.replace("...", "").split("...", 1)[0].split("*", 1)[0].split("for", 1)[0].replace(/\n/g, " ").replace("...", "").toUpperCase();
      }
      if(alertCrawl != ""){
        CONFIG.crawl = alertCrawl;
      }
      alertsActive = alerts.length > 0;
      fetchForecast();
    });
  })
}

function fetchForecast(){
  if (CONFIG.useTWC) {
    fetch(`https://api.weather.com/v1/geocode/${latitude}/${longitude}/forecast/daily/10day.json?language=${CONFIG.language}&units=${CONFIG.units}&apiKey=${CONFIG.secrets.twcAPIKey}`)
    .then(function(response) {
      if (response.status !== 200) {
        console.log('forecast request error');
        return;
      }
      response.json().then(function(data) {
        let forecasts = data.forecasts
        // narratives
        let ns = []
        ns.push(forecasts[0].day || forecasts[0].night)
        ns.push(forecasts[0].day ? forecasts[0].night : forecasts[1].day)
        ns.push(forecasts[0].day ? forecasts[1].day : forecasts[1].night)
        ns.push(forecasts[0].day ? forecasts[1].night : forecasts[2].day)
        for (let i = 0; i <= 3; i++) {
          let n = ns[i]
          forecastTemp[i] = n.temp
          forecastIcon[i] = n.icon_code
          forecastNarrative[i] = n.narrative
          forecastPrecip[i] = `${n.pop}% Chance<br/> of ${n.precip_type.charAt(0).toUpperCase() + n.precip_type.substr(1).toLowerCase()}`
        }
        // 7 day outlook
        for (var i = 0; i < 7; i++) {
          let fc = forecasts[i]
          outlookHigh[i] = fc.max_temp
          outlookLow[i] = fc.min_temp
          outlookCondition[i] = (fc.day ? fc.day : fc.night).phrase_12char.split(' ').join('<br/>')
          outlookIcon[i] = (fc.day ? fc.day : fc.night).icon_code
        }
        fetchRadarImages();
      })
    })
  } else {
    fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/forecast10day/q/${zipCode}.json`)
    .then(function(response) {
      if (response.status !== 200) {
        console.log("forecast request error");
        return;
      }
      response.json().then(function(data) {
        // 7 day data
        for (var i = 0; i < 7; i++) {
          outlookHigh[i] = data.forecast.simpleforecast.forecastday[i].high.fahrenheit;
          outlookLow[i] = data.forecast.simpleforecast.forecastday[i].low.fahrenheit;
          outlookCondition[i] = data.forecast.simpleforecast.forecastday[i].conditions
          // Because thunderstorm won't fit in the day box, multiline it
          outlookCondition[i] = outlookCondition[i].replace("Thunderstorm", "Thunder</br>storm");
          outlookIcon[i] = data.forecast.simpleforecast.forecastday[i].icon;
        }

        // narratives
        for (var i = 0; i <= 3; i++){
          forecastTemp.push(data.forecast.simpleforecast.forecastday[i].high.fahrenheit);
          forecastTemp.push(data.forecast.simpleforecast.forecastday[i].low.fahrenheit);
          forecastIcon[i] = data.forecast.txt_forecast.forecastday[i].icon;
          forecastNarrative[i] = data.forecast.txt_forecast.forecastday[i].fcttext;
          forecastPrecip[i] = guessPrecipitation(forecastNarrative[i], forecastTemp[i]);
        }
        fetchRadarImages();
      });
    })
  }
}

function fetchCurrentWeather(){
  if(CONFIG.useTWC) {
    fetch(`https://api.weather.com/v3/location/point?postalKey=${zipCode}:${CONFIG.countryCode}&language=${CONFIG.language}&format=json&apiKey=${CONFIG.secrets.twcAPIKey}`)
    .then(function(response) {
      if (response.status !== 200) {
        console.log('conditions request error');
        return;
      }
      response.json().then(function(data) {
        try {
          // which LOCALE?!
          cityName = ((data.location.locale.locale1 || data.location.locale.locale2 || data.location.locale.locale3 || data.location.locale.locale4) || data.location.display[0]).toUpperCase();
          latitude = data.location.latitude;
          longitude = data.location.longitude;
        } catch (err) { 
          alert('Enter valid ZIP code'); 
          console.error(err)
          getZipCodeFromUser(); 
          return; 
        }
        fetch(`https://api.weather.com/v1/geocode/${latitude}/${longitude}/observations/current.json?language=${CONFIG.language}&units=${CONFIG.units}&apiKey=${CONFIG.secrets.twcAPIKey}`)
        .then(function(response) {
          if (response.status !== 200) {
            console.log("conditions request error");
            return;
          }
          response.json().then(function(data) {
            // cityName is set in the above fetch call and not this one
            let unit = data.observation[CONFIG.unitField];
            currentTemperature = Math.round(unit.temp);
            currentCondition = data.observation.phrase_32char;
            windSpeed = `${data.observation.wdir_cardinal} ${unit.wspd} ${CONFIG.unit === 'm' ? 'km/h' : 'mph'}`;
            gusts = unit.gust || 'NONE';
            feelsLike = unit.feels_like
            visibility = Math.round(unit.vis)
            humidity = unit.rh
            dewPoint = unit.dewpt
            pressure = unit.altimeter
            let ptendCode = data.observation.ptend_code
            pressureTrend = (ptendCode == 1 || ptendCode == 3) ? '▲' : ptendCode == 0 ? '' : '▼'; // if ptendCode == 1 or 3 (rising/rising rapidly) up arrow else its steady then nothing else (falling (rapidly)) down arrow
            currentIcon = data.observation.icon_code
            fetchAlerts();
          });
        });
      })
      
    });
  } else {
    fetch(`https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/conditions/q/${zipCode}.json`)
    .then(function(response) {
      if (response.status !== 200) {
        console.log("conditions request error");
        return;
      }
      response.json().then(function(data) {
        try{cityName = data.current_observation.display_location.city.toUpperCase();}
        catch(err){alert("Enter valid ZIP code"); getZipCodeFromUser(); return;}
        currentTemperature = Math.round(data.current_observation.temp_f).toString().toUpperCase();
        currentCondition = data.current_observation.weather;
        windSpeed = data.current_observation.wind_dir + " " + data.current_observation.wind_mph + "mph";
        gusts = data.current_observation.wind_gust_mph;
        if(gusts == "0"){gusts = "NONE";}
        feelsLike = data.current_observation.feelslike_f;
        visibility = Math.round(data.current_observation.visibility_mi);
        humidity = data.current_observation.relative_humidity.replace("%", "");
        dewPoint = data.current_observation.dewpoint_f;
        pressure = data.current_observation.pressure_in;
        if(data.current_observation.pressure_trend == "+"){
          pressureTrend = "▲"
        }else{
          pressureTrend = "▼"
        }
        currentIcon = data.current_observation.icon;

        // This API only gives day icons for current conditions (for some reason?)
        // So if the time is between 7pm and 5am, we use the night icon
        var currentTime = new Date();
        if(currentTime.getHours() < 5 && currentTime.getHours() > 19){
          currentIcon = "nt_" + currentIcon;
        }
        fetchAlerts();
      });
    })
  }
  
}

function fetchRadarImages(){
  radarImage = new Image();
  radarImage.onerror = function () {
    getElement('radar-container').style.display = 'none';
  }
  radarImage.src = `https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/animatedradar/q/MI/${zipCode}.gif?newmaps=1&timelabel=1&timelabel.y=10&num=5&delay=10&radius=100&num=15&width=1235&height=525&rainsnow=1&smoothing=1&noclutter=1`;

  if(alertsActive){
    zoomedRadarImage = new Image();
    zoomedRadarImage.onerror = function () {
      getElement('zoomed-radar-container').style.display = 'none';
    }
    zoomedRadarImage.src = `https://api.wunderground.com/api/${CONFIG.secrets.wundergroundAPIKey}/animatedradar/q/MI/${zipCode}.gif?newmaps=1&timelabel=1&timelabel.y=10&num=5&delay=10&radius=50&num=15&width=1235&height=525&rainsnow=1&smoothing=1&noclutter=1`;
  }

  scheduleTimeline();
}
