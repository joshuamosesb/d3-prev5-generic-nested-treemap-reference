Sample d3 v4 sample code snippet to render multi-level nested treemap chart
* takes in flat csv data, uses d3.nest to construct multi-level, multi-metric(@leaf-level) nested JSON structire 
* uses d3.hierarchy to compute tolled-up values for size & color metric at repective parent level
* provides Drill-down (show-hide toggle) to cycle thru the layers
