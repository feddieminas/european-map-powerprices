/* ----- BASE VARIABLES ----- */
const promises = [];
const files = ["data/powerprices_vertically.csv", "data/countries-simplified.json"];
let allData;

files.forEach(function(url, index) {
   promises.push(index ? d3.json(url) : d3.csv(url))
});

Promise.all(promises).then(function(data) {
  makeGraphs(data[0], data[1]); //prices, states
});

//charts
const choroplethChart = dc.geoChoroplethChart("#europe-map-chart");
const TableChart = new dc.DataTable("#europe-table-chart");

//Date
const date_input = document.querySelector('#ddate');
let dateLets = {dateDim: undefined, dateMin: undefined, dateMaxReset: undefined, ddateCol: undefined, dateOffsetFromMin: -99999};
//Crossfilter
let ndx = undefined;
let tableLets = {ofs: 0, pag: 5}

/* ----- EVENT LISTENERS ----- */

const dateFormatFromDropdown = (datestr) => { //date format output to YYYYMMDD
    const date = new Date(datestr);
    return `${date.getFullYear()}${((date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1)))}${((date.getDate() > 9) ? date.getDate() : ('0' + date.getDate()))}`
 }
 
const updateValue = (e) => {
    let dateFilter;
    if (e.target.value === '') { //assume pressed clear button
        date_input.value = date_input.max;
        dateFilter = Number(dateFormatFromDropdown(date_input.max));
    } else {
        dateFilter = Number(dateFormatFromDropdown(e.target.value));
    }
    if (dateLets.dateOffsetFromMin != (dateFilter - dateLets.dateMin)) {
        dateLets.dateOffsetFromMin = parseInt(dateFilter - dateLets.dateMin);
        dateLets.dateDim.filter(null); //reset filter
        //dateLets.dateDim.filter(dateLets.ddateCol[dateLets.dateOffsetFromMin]); //one option
        dateLets.dateDim.filterRange([dateLets.ddateCol[dateLets.dateOffsetFromMin], dateLets.ddateCol[dateLets.dateOffsetFromMin+1]]);
        dc.redrawAll();
    }
    return
}

const actions = { //https://stackoverflow.com/questions/11845678/adding-multiple-event-listeners-to-one-element
    change: {
        updateValue,
    },
    blur: {
        updateValue,
    }
}

Object.keys(actions).forEach(key => date_input.removeEventListener(key, Object.values(actions[key])[0]));
Object.keys(actions).forEach(key => date_input.addEventListener(key, Object.values(actions[key])[0]));

/* ----- HELPERS ----- */
const numberFormat = d3.format(".2f");
dc.config.defaultColors(d3.interpolateBlues)

/* ----- MAIN FUNCTIONS ----- */

//Reset
function Reset() {
    date_input.value = dateLets.dateMaxReset;
    dateLets.dateDim.filter(null); dateLets.dateDim.filter(dateLets.dateDim.top(1)[0].DDATE);
    dc.filterAll(); dc.redrawAll();
}
document.getElementById("reset").removeEventListener('click', Reset);
document.getElementById("reset").addEventListener('click', Reset);

//Create graphs
const dateFormat = (datestr) => { //date format output to MM/DD/YYYY
    const date = new Date(datestr);
    return `${((date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1)))}/${((date.getDate() > 9) ? date.getDate() : ('0' + date.getDate()))}/${date.getFullYear()}`
}

const dateFormatToDropdown = (datestr) => { //date format output to MM-DD-YYYY
    const date = new Date(datestr);
    return `${date.getFullYear()}-${((date.getMonth() > 8) ? (date.getMonth() + 1) : ('0' + (date.getMonth() + 1)))}-${((date.getDate() > 9) ? date.getDate() : ('0' + date.getDate()))}`
}

function makeGraphs(pricesJson, statesJSON) {

    //DATA manipulate and keep a copy
    pricesJson = pricesJson.map(function(d) {
        return {...d, "DDATE": dateFormat(d.DDATE) }
    });
    allData = pricesJson;
    pricesJson = pricesJson.map(function(d) {
        return {...d, "ZONES": d["ZONES"] == "NAT" || d["ZONES"] == "PUN"? "" : d["ZONES"] }
    });
    
    //enable crossfilter
    ndx = crossfilter(pricesJson);

    //DDATE Dropdown
    dateLets.ddateCol = pricesJson.map(function(d) { //https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date
        return dateFormatToDropdown(d.DDATE); 
    }).sort((a, b) => b[1] - a[1]);
    date_input.value = dateLets.ddateCol[dateLets.ddateCol.length - 1];
    dateLets.dateMaxReset = dateLets.ddateCol[dateLets.ddateCol.length - 1];
    date_input.min = dateLets.ddateCol[0];
    date_input.max = dateLets.ddateCol[dateLets.ddateCol.length - 1];

    //DDATE Dropdown filtering
    dateLets.ddateCol = [...new Set(pricesJson.map(function(d) { //https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date
        return d.DDATE;
    }).sort((a, b) => b[1] - a[1]))]
    let nextOfLastDay = new Date(dateLets.ddateCol[dateLets.ddateCol.length - 1]);
    nextOfLastDay = dateFormatToDropdown(nextOfLastDay.setDate(nextOfLastDay.getDate()+1)); //for filter range function
    dateLets.ddateCol.push(nextOfLastDay);

    //DDATE DC.js filtering
    dateLets.dateDim = ndx.dimension(function (d) {
        return d.DDATE;
    });
    dateLets.dateMin = Number(dateFormatFromDropdown(dateLets.dateDim.bottom(1)[0].DDATE));
    dateLets.dateDim.filter(null); //clear filters
    dateLets.dateDim.filter(dateLets.dateDim.top(1)[0].DDATE);

    //EUROPEAN MAP CHART
    const countryDim = ndx.dimension(function (d) {
        return d["COUNTRY"];
    });

    const avgPrices = countryDim.group().reduceSum(function(d) {
        return d["ZONES"] != ""? 0 :numberFormat(d["AVG"]);
    });

    const max_state = avgPrices.top(1)[0].value; //highest AVG Price
    const w = 1100; const h = 600;

    choroplethChart
        .width(w)
        .height(h)
        .dimension(countryDim)
        .group(avgPrices)
        .colors(d3.scaleSequential(d3.interpolateBlues))
        //.colors(d3.scaleQuantize().range(["#E2F2FF", "#C4E4FF", "#9ED2FF", "#81C5FF", "#6BBAFF", "#51AEFF", "#36A2FF", "#1E96FF", "#0089FF", "#0061B5"]))
        .colorDomain([0, max_state])
        .colorCalculator(function (d) { return d ? choroplethChart.colors()(d) : '#ccc'; })
        .title(function (d) {
            return "Country: " + d.key + "\nPrice : " + numberFormat(d.value ? d.value : 0);
        })
        .valueAccessor(function(kv) {
            return kv.value;
        })
        .overlayGeoJson(statesJSON["features"], "state", function (d) {
            return d.properties.sovereignt;
        })
        .transitionDuration(0)
        .projection(d3.geoMercator()
            .center([ 13, 52 ])
            .scale([ w / 1.5 ])
            .translate([ w / 3.5, h / 2.05 ])
            .precision(0.1))
        ///
        .on('renderlet', drawAdditionalStuffInMap);

        function drawAdditionalStuffInMap(_chart) {
            console.log("renderlet map")
            const svg = _chart.svg();
            svg.selectAll("g.additionalStuff").remove();

            let group = svg.selectAll("g.additionalStuff");

            if (group.empty()) {
                group = svg.append("g").classed("additionalStuff", true);
            }

            const zonesTransformXY = [
                {"ZONES": "NO5", "x": 225, "y": 95, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "NO4", "x": 290, "y": 10, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "NO3", "x": 255, "y": 40, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "NO2", "x": 245, "y": 135, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "NO1", "x": 285, "y": 95, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "DK2", "x": 290, "y": 230, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "DK1", "x": 260, "y": 200, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "SE4", "x": 320, "y": 190, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "SE3", "x": 340, "y": 120, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "SE2", "x": 340, "y": 60, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "SE1", "x": 350, "y": 20, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "SUD", "x": 370, "y": 510, "r": 10, "dx": -9, "dy": 4},
                {"ZONES": "CALA", "x": 365, "y": 540, "r": 14, "dx": -13, "dy": 4},
                {"ZONES": "CNOR", "x": 295, "y": 450, "r": 14, "dx": -13, "dy": 4},
                {"ZONES": "CSUD", "x": 330, "y": 485, "r": 14, "dx": -13, "dy": 4},
                {"ZONES": "NORD", "x": 280, "y": 415, "r": 14, "dx": -13, "dy": 4},
                {"ZONES": "SARD", "x": 265, "y": 515, "r": 14, "dx": -13, "dy": 4},
                {"ZONES": "SICI", "x": 330, "y": 555, "r": 10, "dx": -9, "dy": 4},
            ]

            _chart.dimension().top(Infinity)
                .filter(d => d["ZONES"] != '')
                .map(function(d) {
                    const idx = zonesTransformXY.findIndex(({ ZONES }) => ZONES === d.ZONES);
                    const data = {"ZONES": d.ZONES, "AVG": numberFormat(d["AVG"]), ...zonesTransformXY[idx]};
                    const elemEnter = group.append("g").data([data]).classed("zone_1", true).attr("transform", function(d){ return "translate(" + d.x + "," + d.y + ")"; });

                    elemEnter.append("circle")
                        .attr("x", 0)
                        .attr("y", 0)
                        .attr("r", function(d){return d.r})
                        .attr("stroke","black")
                        .attr("fill", "#D2B48C");
                        
                    elemEnter.append("text")
                        .attr("dx", function(d){return d.dx})
                        .attr("dy", function(d){return d.dy})
                        .text(function(d){return d.ZONES})
                        .style("font-size", "0.55rem")
                        .style("font-weight", "bold");

                    elemEnter.append("svg:title")
                        .text(function(d) { return d.AVG; })

                    elemEnter.exit().remove();
            });

            //remove svg elements not needed
            svgCtriesNotNeeded = [
                "kazakhstan", "uzbekistan", "turkmenistan", "tajikistan", "kyrgyzstan",
                "afghanistan", "iran", "azerbaijan", "armenia", "iraq", "syria"
            ];

            for (country of svgCtriesNotNeeded) {
                $(`g.state.${country}`).remove();
            };            
        }

    //TABLE CHART
    const countryTblDim = ndx.dimension(function (d) {
        return d["COUNTRY"] + d["ZONES"];
    });

    TableChart //https://dc-js.github.io/dc.js/docs/html/dc.dataTable.html
        .dimension(countryTblDim)
        .size(Infinity)
        .showSections(true)
        .section(d => {
            return d["COUNTRY"];
        })
        .columns([
            "COUNTRY",
            "DDATE",
            { label: "ZONES", format: function (d) {return d["ZONES"] == ""? "NAT": d["ZONES"]} },
            { label: "H1", format: function (d) {return numberFormat(d['H1']);} },
            { label: "H2", format: function (d) {return numberFormat(d['H2']);} },
            { label: "H3", format: function (d) {return numberFormat(d['H3']);} },
            { label: "H4", format: function (d) {return numberFormat(d['H4']);} },
            { label: "H5", format: function (d) {return numberFormat(d['H5']);} },
            { label: "H6", format: function (d) {return numberFormat(d['H6']);} },
            { label: "H7", format: function (d) {return numberFormat(d['H7']);} },
            { label: "H8", format: function (d) {return numberFormat(d['H8']);} },
            { label: "H9", format: function (d) {return numberFormat(d['H9']);} },
            { label: "H10", format: function (d) {return numberFormat(d['H10']);} },
            { label: "H11", format: function (d) {return numberFormat(d['H11']);} },
            { label: "H12", format: function (d) {return numberFormat(d['H12']);} },
            { label: "H13", format: function (d) {return numberFormat(d['H13']);} },
            { label: "H14", format: function (d) {return numberFormat(d['H14']);} },
            { label: "H15", format: function (d) {return numberFormat(d['H15']);} },
            { label: "H16", format: function (d) {return numberFormat(d['H16']);} },
            { label: "H17", format: function (d) {return numberFormat(d['H17']);} },
            { label: "H18", format: function (d) {return numberFormat(d['H18']);} },
            { label: "H19", format: function (d) {return numberFormat(d['H19']);} },
            { label: "H20", format: function (d) {return numberFormat(d['H20']);} },
            { label: "H21", format: function (d) {return numberFormat(d['H21']);} },
            { label: "H22", format: function (d) {return numberFormat(d['H22']);} },
            { label: "H23", format: function (d) {return numberFormat(d['H23']);} },
            { label: "H24", format: function (d) {return numberFormat(d['H24']);} },
            { label: "AVG", format: function (d) {return numberFormat(d['AVG']);} }
        ])
        .on('preRender', update_offset)
        .on('preRedraw', update_offset)
        .on('pretransition', display);

    //DOWNLOAD DATA
    d3.select('#download').on('click', null);
    d3.select('#download')
        .on('click', function() {
            let data = countryTblDim.top(Infinity);
            if(d3.select('#download-type input:checked').node().value === 'table') {
                data = data.map(function(d) {
                    let row = {};
                    TableChart.columns().forEach(function(c) {
                            row[TableChart._doColumnHeaderFormat(c)] = TableChart._doColumnValueFormat(c, d);
                });
                return row;
                });
            } else {
                data = allData;
            }
            const blob = new Blob([d3.csvFormat(data)], {type: "text/csv;charset=utf-8"});
            saveAs(blob, 'downloaded_data.csv');
        });


    dc.renderAll();
}

//TABLE CHART Side Functions
function update_offset() {
   const totFilteredRecs = ndx.groupAll().value();
   const end = tableLets.ofs + tableLets.pag > totFilteredRecs ? totFilteredRecs : tableLets.ofs + tableLets.pag;
   tableLets.ofs = tableLets.ofs >= totFilteredRecs ? Math.floor((totFilteredRecs - 1) / tableLets.pag) * tableLets.pag : tableLets.ofs;
   tableLets.ofs = tableLets.ofs < 0 ? 0 : tableLets.ofs;
   TableChart.beginSlice(tableLets.ofs);
   TableChart.endSlice(tableLets.ofs + tableLets.pag);
}

function display() {
    const totFilteredRecs = ndx.groupAll().value();
    const end = tableLets.ofs + tableLets.pag > totFilteredRecs ? totFilteredRecs : tableLets.ofs + tableLets.pag;
    d3.select('#begin')
        .text(end === 0? tableLets.ofs : tableLets.ofs + 1);
    d3.select('#end')
        .text(end);
    d3.select('#last')
        .attr('disabled', tableLets.ofs - tableLets.pag<0 ? 'true' : null);
    d3.select('#next')
        .attr('disabled', tableLets.ofs + tableLets.pag>=totFilteredRecs ? 'true' : null);
    d3.select('#size').text(totFilteredRecs);
    if(totFilteredRecs != ndx.size()){
        d3.select('#totalsize').text("(filtered Total: " + ndx.size() + " )");
    }else{
        d3.select('#totalsize').text('');
    }
}

function next() {
    tableLets.ofs += tableLets.pag;
   update_offset();
   TableChart.redraw();
}

function last() {
    tableLets.ofs -= tableLets.pag;
   update_offset();
   TableChart.redraw();
}