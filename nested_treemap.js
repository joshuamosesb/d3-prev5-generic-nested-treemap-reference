const agg_opts = {"count": _.size, 
                 "mean": d3.mean, 
                 "max": d3.max, 
                 "min": d3.min,
                 "uniq": _.uniq
                }


function multi_nest_data(in_opt, in_data){

  function level_rollup(sub_df) {
    // apply agg fn based on config
    let agg_rec = {}
    for (met_col in in_opt["metric-rollup-map"]) {
      let agg_op = in_opt["metric-rollup-map"][met_col]["op"]
      let val_scores = sub_df
      if(_.contains(['mean', 'min', 'mix'], agg_op)){
        val_scores = _.filter(sub_df, d => { return !_.isNull(d[met_col]) && !_.isNaN(Number(d[met_col])); })
      }
      let agg_fn = agg_opts[agg_op]
      if (agg_op == 'uniq') {
        agg_rec[met_col] = agg_fn(_.pluck(val_scores, met_col))
      }else{
        agg_rec[met_col] = agg_fn(val_scores, d => d[met_col])
      }
    } 
    return agg_rec;
  }
  
  var nested_ds = d3.nest(),
      lvl_agg = []
      //mid_nest_ds = d3.nest(),
  //ref: https://stackoverflow.com/a/12416694/4161807 - multi-level d3.nesting
  _.each(in_opt['group-keys'], function(lvl_key, lvl_i){
    nested_ds.key(d => {return d[lvl_key];})
    // mid_nest_ds.key(d => {return d[lvl_key];})
    // //level-wise rollup
    // if (lvl_i == 0) {
    //   lvl_agg[lvl_i] = d3.nest()
    //                   .key(d => {return d[lvl_key];})
    //                   .rollup(level_rollup)
    //                   .object(in_data)
    // }else if (lvl_i == 1){
    //   lvl_agg[lvl_i] = mid_nest_ds.rollup(level_rollup)
    //                     .object(in_data)
    // }
    // To-do: add sorting based on config
  }); //end group-keys loop
  nested_ds.rollup(level_rollup);//end rollup
  nested_ds = nested_ds.entries(in_data)
  return nested_ds
}

function rollup_levels(opts, nested_ds){
  let hier_ds = d3.hierarchy(nested_ds, d => {return d["values"]})
                  .count()
                  .sort(function(a, b) { return +b.value - +a.value; });
                  //.sum(d => {return d3.sum(_.pluck(d["values"], in_opt["size-col"])) })
  //compute agg at each node level
  hier_ds.each(function(curr_node) {
    let ch_size_col = [],
        ch_color_col = [];
    _.each(curr_node.leaves(), function(ch_nd, ch_seq){
      ch_size_col.push(ch_nd.data.value[opts["size-col"]])
      ch_color_col.push(ch_nd.data.value[opts["color-col"]])
    })
    //To-Do: take agg-operation from config
    curr_node[opts["size-col"]] = d3.sum(ch_size_col)
    curr_node.value = curr_node[opts["size-col"]]
    curr_node[opts["color-col"]] = d3.mean(ch_color_col)
  })
  return hier_ds
}

function hovered(hover) {
  return function(d) {
    d3.selectAll(d.ancestors().map(function(d) { return d.node; }))
        .classed("node--hover", hover)
      .select("rect")
        .attr("width", function(d) { return d.x1 - d.x0 - hover; })
        .attr("height", function(d) { return d.y1 - d.y0 - hover; });
  };
}

function initial_view(){
  $("rect[class!='depth-1'], tspan[class!='depth-1']").css("opacity", 0)
  $("rect[class='depth-0'], tspan[class='depth-0']").css("opacity", 1)
  $("rect[class='depth-1'], tspan[class='depth-1']").css("opacity", 1)
  $("rect[class='depth-0']").css("fill", "#DDD")
}

//takes single rooted heirarchical data to render the treemap
function draw_treemap(cont_id, in_opt, input_do) {
  var defaults = {
      margin: {top: 24, right: 0, bottom: 0, left: 0},
      rootname: "ROOT",
      formatCount: ",d",
      formatPct: "0.1f",
      title: "",
      width: 1200,
      height: 500
  };
  var opts = $.extend(true, {}, defaults, in_opt);

  var nested_ds = {"key": in_opt["root-name"]}
  nested_ds["values"] = input_do

  $(`${cont_id} *`).remove()
  if(opts['group-keys']){
    nested_ds["values"] = multi_nest_data(opts, input_do)
  }
  render_treemap(cont_id, opts, rollup_levels(opts, nested_ds))
  //debug-test render separate treemap one Tech-group
  for(let indx=0; indx< nested_ds["values"].length; indx++){
    let test_ds = nested_ds["values"][indx]
    // nested_ds['key'] = test_ds["key"]
    // nested_ds["values"] = test_ds["values"]
    $("#report_container").append(`<div id='tm_${indx}'></div>`)
    render_treemap(`${cont_id} #tm_${indx}`, opts, rollup_levels(opts, test_ds))
  }
}

function render_treemap(cont_id, opts, hier_ds){
  var formatNum = d3.format(opts.formatCount),
      formatPct = d3.format(opts.formatPct),
      rname = opts.rootname,
      margin = opts.margin,
      theight = 36 + 16;
  var width = opts.width - margin.left - margin.right,
      height = opts.height - margin.top - margin.bottom - theight,
      transitioning;

  var svg_base = d3.select(cont_id)
                 .append("svg")
                 .attr("width", "98vw")
                 .attr("height",  "90vh")
                 .attr("viewBox", `0 0 ${width} ${height}`);
                //  .attr("width", opts.width)
                //  .attr("height", opts.height);
  var leaf_color = d3.scaleLinear()
    .range(["#AF0000", "#AFAF00", "#00AF00"])
    .domain([0, 50, 100]); 
    //To-Do: take domain from the metric lo,mid,hi
  var parent_color = d3.scaleLinear()
    .range(["#777", "#DDD"])
    .domain([0, 4])

  var treemap = d3.treemap()
    .size([width, height])
    .paddingOuter(5)
    .paddingTop(19)
    .paddingInner(2)
    .round(true);
    //.value(d => {return d["key"]})
    //.children(d => {return d["values"]});

  treemap(hier_ds)
  var cell = svg_base
    .selectAll(".node")
    .data(hier_ds.descendants())
    .enter().append("g")
      .attr("transform", function(d) { return "translate(" + d.x0 + "," + d.y0 + ")"; })
      .attr("class", d => { return `node depth-${d.depth}`})
      .each(function(d) { d.node = this; })
      .on("mouseover", hovered(true))
      .on("mouseout", hovered(false));

  cell.append("rect")
    .attr("key", function(d) { return "rect-" + d.data.key; })
    .attr("width", function(d) { return d.x1 - d.x0; })
    .attr("height", function(d) { return d.y1 - d.y0; })
    .style("padding", "1px")
    // .style("stroke-width", "0.2px")
    // .style("stroke", "#777")
    .attr("class", nd => { return `depth-${nd.depth}` })
    .attr("parent", function(d){ return d.parent ? d.parent.data.key : '' })
    .attr("text-search", function(d){
        let srch_txt = d.data.key;
        for(let sidx=0; sidx < opts["text-search-cols"].length; sidx++){
          if(!d.children && opts["text-search-cols"][sidx] in d.data.value){
            srch_txt = srch_txt.concat("|").concat(d.data.value[opts["text-search-cols"][sidx]])
          }
        }
        return srch_txt 
      })
    .attr("color-val", cv => { return cv["children"] ? cv.depth : cv["data"]["value"][opts["color-col"]] })
    .style("fill", function(d) { 
        // let rect_colr = d["children"] ? parent_color(d.depth) : leaf_color(d["data"]["value"][opts["color-col"]]);
        let rect_colr = d["children"] ? leaf_color(d[opts["color-col"]]) : leaf_color(d["data"]["value"][opts["color-col"]]);
        //console.log(["color for ", d.key, ": ", rect_colr])  
        return rect_colr;
      })
    .on("click", function(drect){
      if(drect.children){
        $(`rect[class='depth-${(drect.depth)}']`).css("opacity", 0.2)
        d3.selectAll(`.depth-${(drect.depth+1)}`).style("opacity", 1)
      }else{
        initial_view()
      }
    });
  cell.append("title")
      .attr("class", "toolTip")
      .text(function(d) { 
        let hvr_txt = d.data["key"].concat(":\n")
                                  .concat("Learners#:\xa0").concat(formatNum(d.value)).concat("\n")
        if(!d.children){
          _.each(opts["metric-rollup-map"], function(ag_ob, mt_col){
            txt_val = d.data.value[mt_col]
            if(ag_ob["prefix"]) { txt_val = ag_ob["prefix"] + txt_val; }
            if(ag_ob["format"]) {
              txt_val = d3.format(ag_ob["format"])(d.data.value[mt_col]);
            } 
            if(ag_ob["suffix"]) { txt_val = txt_val+ag_ob["suffix"]; }
            hvr_txt = hvr_txt.concat(`${mt_col}:\xa0`).concat(txt_val).concat("\n")
          })
        }else{
          hvr_txt = hvr_txt.concat(`${opts["color-col"]}%:\xa0`).concat(formatPct(d[opts["color-col"]]));
        }
        return hvr_txt;
      });
  var tool = d3.select("body").append("div").attr("class", "toolTip");
  var label = cell.append("text")
  // label
  //   .filter(function(d) { return d.children; })
  //   .selectAll("tspan")
  //     .data(function(d) { 
  //       let txt_vo = {}
  //       txt_vo["depth"] = d.depth,
  //       txt_vo["txt"] = d.data["key"].concat(":\xa0").concat(formatNum(d.value))
  //       return txt_vo;
  //     })
  //   .enter().append("tspan")
  //     .attr("class", nd => { return `depth-${nd.depth}` })
  //     .attr("x", function(d, i) { return i ? null : 4; })
  //     .attr("y", 13)
  //     .style("font-size", "0.75em")
  //     .style("cursor", "pointer")
  //     .text(function(nd) {
  //         return nd.txt
  //     });
  // function ttext(text) {
  //   text.selectAll("tspan")
  //       .attr("x", function(d) { return x(d.x) + 10; })
  //   text.attr("x", function(d) { return x(d.x) + 10; })
  //       .attr("y", function(d) { return y(d.y) + 10; })
  //       .style("opacity", function(d) { return this.getComputedTextLength() < x(d.x + d.dx) - x(d.x) ? 1 : 0; });
  // }
  label
    .filter(function(d) { return d.children; })
    .selectAll("tspan")
      .data(function(d) { 
        return [`${formatNum(d.value).concat(":").concat(d.data["key"])}|${d.depth}`]
      })
    .enter().append("tspan")
      .attr("class", txt => { return `depth-${txt.split('|')[1]}` })
      .attr("x", function(d, i) { return i ? null : 4; })
      .attr("y", 13)
      .style("font-size", "0.75em")
      .style("cursor", "pointer")
      .text(function(txt) {
        disp_txt = (txt.split('|')[0]).split(":")  
        disp_name = disp_txt[1].length > 10 ? (_.first(disp_txt[1], 10)).join("")+"..." : disp_txt[1]
        return (disp_txt[0] + ": " + disp_name)
      })
      .on("click", function(txt){
        let cur_lvl = txt.split('|')[1]
        cur_lvl = Number(cur_lvl) % (opts["group-keys"].length)
        if(cur_lvl > 0){
          $(`rect[class='depth-${(cur_lvl)}']`).css("opacity", 0.2)
          d3.selectAll(`.depth-${(cur_lvl+1)}`).style("opacity", 1)
        }else{
          initial_view()
        }
      });
  //init: hinde all children
  initial_view()
  // $("rect[class!='depth-1']").css("opacity", 0.3)
}
