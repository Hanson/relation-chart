import * as d3 from 'd3';

/**
 * 拓展对象
 * newconfig = extend({},defaultConfig,myconfig)
 */
function extend(target) {
    var sources = Array.prototype.slice.call(arguments, 1);

    for (var i = 0; i < sources.length; i += 1) {
        var source = sources[i];
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
    }
    return target;
};

// 求两点间的距离
function getDis(s, t) {
    return Math.sqrt((s.x - t.x) * (s.x - t.x) + (s.y - t.y) * (s.y - t.y));
}

// 求元素移动到目标位置所需要的 transform 属性值
function getTransform(source, target, _dis) {
    var r;
    if (target.x > source.x) {
        if (target.y > source.y) {
            r = Math.asin((target.y - source.y) / _dis)
        } else {
            r = Math.asin((source.y - target.y) / _dis);
            r = -r;
        }
    } else {
        if (target.y > source.y) {
            r = Math.asin((target.y - source.y) / _dis);
            r = Math.PI - r;
        } else {
            r = Math.asin((source.y - target.y) / _dis);
            r -= Math.PI;
        }
    }
    r = r * (180 / Math.PI);
    return "translate(" + source.x + "," + source.y + ")rotate(" + r + ")";
}

// 默认配置
const defaultConfig = {
    width: 1000,                 // 总画布svg的宽
    height: 800,                // 高
    nodes: [],                  // 节点数组
    links: [],                  // 线数组
    isHighLight: true,        // 是否启动 鼠标 hover 到节点上高亮与节点有关的节点，其他无关节点透明的功能
    isScale: true,              // 是否启用缩放平移zoom功能
    scaleExtent: [0.01, 3],      // 缩放的比例尺 (扩展范围：最小0.01倍，最大3倍)
    chargeStrength: -300,        // 万有引力
    collide: 100,                 // 碰撞力的大小 （节点之间的间距）
    nodeWidth: 160,             // 每个node节点所占的宽度，正方形
    margin: 20,                 // node节点距离父亲div的margin
    alphaDecay: 0.0228,          // 控制力学模拟衰减率
    r: 45,                      // 头像的半径 [30 - 45]
    relFontSize: 12,           // 关系文字字体大小
    linkSrc: 30,                // 划线时候的弧度
    linkColor: '#bad4ed',        // 链接线默认的颜色
    strokeColor: '#7ecef4',     // 头像外围包裹的颜色
    strokeWidth: 3,             // 头像外围包裹的宽度
    showToolbar: true,          // 是否显示工具栏
    searchPlaceholder: '搜索节点...', // 搜索框占位文字
    // 透明度配置 - 根据关系距离设置不同透明度
    opacityLevels: {
        direct: 1,           // 直接关联节点（1度关系）
        unrelated: 0.15,     // 无关系节点（包括二度及更远）
        normal: 1            // 正常状态
    },
}

export default class RelationChart {

    constructor(selector, data, configs = {}) {

        // console.log(selector)
        // console.log(d3.select(selector))
        // d3.select(selector).style('background', '#fff')
        // console.log('画布宽：：：' + d3.select(selector).style('width'))
        // console.log('画布高：：：' + d3.select(selector).style('height'))
        // console.log(parseInt(d3.select(selector).style('width')))
        // console.log(parseInt(d3.select(selector).style('height')))

        let mapW = parseInt(d3.select(selector).style('width'))
        let mapH = parseInt(d3.select(selector).style('height'))

        let defaultWH = {
            width: mapW,
            height: mapH,
        }

        // 画布
        this.map = d3.select(selector);

        // 合并配置
        this.config = extend({}, defaultConfig, data, defaultWH, configs);
        // console.log(this.config)

        // 需要高亮的node和link
        this.dependsNode = [];
        this.dependsLinkAndText = [];

        // 当前缩放状态
        this.currentTransform = d3.zoomIdentity;

        // 聚焦模式状态
        this.focusedNode = null;
        this.isFocusMode = false;

        // 搜索结果和选中索引
        this.currentSearchResults = [];
        this.selectedIndex = -1;

        // 创建工具栏
        if (this.config.showToolbar) {
            this.initToolbar();
        }

        // 创建力学模拟器
        this.initSimulation()
    }

    // 初始化工具栏
    initToolbar() {
        const that = this;

        // 创建工具栏容器
        this.toolbar = this.map.append('div')
            .attr('class', 'relation-chart-toolbar')
            .style('position', 'absolute')
            .style('top', '10px')
            .style('left', '10px')
            .style('z-index', '1000')
            .style('display', 'flex')
            .style('gap', '8px')
            .style('align-items', 'center')
            .style('background', 'rgba(255, 255, 255, 0.95)')
            .style('padding', '8px 12px')
            .style('border-radius', '8px')
            .style('box-shadow', '0 2px 12px rgba(0, 0, 0, 0.15)')
            .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');

        // 缩小按钮
        this.toolbar.append('button')
            .attr('class', 'toolbar-btn zoom-out')
            .attr('title', '缩小')
            .style('width', '32px')
            .style('height', '32px')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '6px')
            .style('background', '#fff')
            .style('cursor', 'pointer')
            .style('font-size', '16px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('transition', 'all 0.2s')
            .html('−')
            .on('click', () => this.zoomOut())
            .on('mouseover', function() { d3.select(this).style('background', '#f5f5f5'); })
            .on('mouseout', function() { d3.select(this).style('background', '#fff'); });

        // 缩放比例输入框（支持手动输入）
        this.zoomDisplay = this.toolbar.append('input')
            .attr('type', 'text')
            .attr('class', 'zoom-display')
            .attr('title', '输入百分比后按回车确认')
            .style('width', '55px')
            .style('height', '28px')
            .style('text-align', 'center')
            .style('font-size', '13px')
            .style('color', '#666')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '4px')
            .style('outline', 'none')
            .style('padding', '0 4px')
            .style('transition', 'all 0.2s')
            .attr('value', '100%')
            .on('keydown', function() {
                const event = window.event || d3.event;
                if (event && event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    const value = this.value;
                    that.handleZoomInput(value);
                }
            })
            .on('focus', function() {
                d3.select(this).style('border-color', '#40a9ff').style('box-shadow', '0 0 0 2px rgba(24, 144, 255, 0.2)');
                // 选中时移除百分号便于编辑
                const input = d3.select(this);
                const val = input.node().value.replace('%', '');
                input.node().value = val;
                input.node().select();
            })
            .on('blur', function() {
                d3.select(this).style('border-color', '#d9d9d9').style('box-shadow', 'none');
                // 失焦时重新添加百分号
                const input = d3.select(this);
                const value = input.node().value.replace('%', '');
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                    input.node().value = Math.round(numValue) + '%';
                } else {
                    input.node().value = Math.round(that.currentTransform.k * 100) + '%';
                }
            });

        // 放大按钮
        this.toolbar.append('button')
            .attr('class', 'toolbar-btn zoom-in')
            .attr('title', '放大')
            .style('width', '32px')
            .style('height', '32px')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '6px')
            .style('background', '#fff')
            .style('cursor', 'pointer')
            .style('font-size', '16px')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('transition', 'all 0.2s')
            .html('+')
            .on('click', () => this.zoomIn())
            .on('mouseover', function() { d3.select(this).style('background', '#f5f5f5'); })
            .on('mouseout', function() { d3.select(this).style('background', '#fff'); });

        // 分隔线
        this.toolbar.append('div')
            .style('width', '1px')
            .style('height', '24px')
            .style('background', '#e8e8e8')
            .style('margin', '0 4px');

        // 重置按钮
        this.toolbar.append('button')
            .attr('class', 'toolbar-btn reset')
            .attr('title', '重置视图')
            .style('padding', '0 12px')
            .style('height', '32px')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '6px')
            .style('background', '#fff')
            .style('cursor', 'pointer')
            .style('font-size', '13px')
            .style('color', '#666')
            .style('transition', 'all 0.2s')
            .text('重置')
            .on('click', () => this.resetView())
            .on('mouseover', function() { d3.select(this).style('background', '#f5f5f5'); })
            .on('mouseout', function() { d3.select(this).style('background', '#fff'); });

        // 分隔线
        this.toolbar.append('div')
            .style('width', '1px')
            .style('height', '24px')
            .style('background', '#e8e8e8')
            .style('margin', '0 4px');

        // 聚焦模式按钮
        this.focusBtn = this.toolbar.append('button')
            .attr('class', 'toolbar-btn focus-mode')
            .attr('title', '聚焦模式：点击节点后持续高亮其关系网')
            .style('padding', '0 12px')
            .style('height', '32px')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '6px')
            .style('background', '#fff')
            .style('cursor', 'pointer')
            .style('font-size', '13px')
            .style('color', '#666')
            .style('transition', 'all 0.2s')
            .text('聚焦')
            .on('click', () => this.toggleFocusMode())
            .on('mouseover', function() { d3.select(this).style('background', '#f5f5f5'); })
            .on('mouseout', function() {
                const btn = d3.select(that.toolbar.node()).select('.focus-mode');
                btn.style('background', that.isFocusMode ? '#e6f7ff' : '#fff');
            });

        // 分隔线
        this.toolbar.append('div')
            .style('width', '1px')
            .style('height', '24px')
            .style('background', '#e8e8e8')
            .style('margin', '0 4px');

        // 搜索容器
        const searchContainer = this.toolbar.append('div')
            .style('position', 'relative')
            .style('display', 'flex')
            .style('align-items', 'center');

        // 搜索输入框
        this.searchInput = searchContainer.append('input')
            .attr('type', 'text')
            .attr('class', 'search-input')
            .attr('placeholder', this.config.searchPlaceholder)
            .style('width', '160px')
            .style('height', '32px')
            .style('padding', '0 32px 0 12px')
            .style('border', '1px solid #d9d9d9')
            .style('border-radius', '6px')
            .style('outline', 'none')
            .style('font-size', '13px')
            .style('transition', 'all 0.2s')
            .on('input', function() { that.handleSearch(this.value); })
            .on('keydown', function() {
                that.handleSearchKeydown(d3.event);
            })
            .on('focus', function() { d3.select(this).style('border-color', '#40a9ff').style('box-shadow', '0 0 0 2px rgba(24, 144, 255, 0.2)'); })
            .on('blur', function() { d3.select(this).style('border-color', '#d9d9d9').style('box-shadow', 'none'); });

        // 搜索图标
        searchContainer.append('span')
            .style('position', 'absolute')
            .style('right', '10px')
            .style('color', '#bfbfbf')
            .style('font-size', '14px')
            .style('pointer-events', 'none')
            .html('🔍');

        // 搜索结果下拉 - 放在搜索容器内，显示在搜索框正下方
        this.searchResults = searchContainer.append('div')
            .attr('class', 'search-results')
            .style('position', 'absolute')
            .style('top', '36px')
            .style('left', '0')
            .style('z-index', '999')
            .style('background', '#fff')
            .style('border-radius', '6px')
            .style('box-shadow', '0 2px 12px rgba(0, 0, 0, 0.15)')
            .style('max-height', '200px')
            .style('overflow-y', 'auto')
            .style('display', 'none')
            .style('min-width', '200px');

        // 确保父容器有定位
        const position = this.map.style('position');
        if (!position || position === 'static') {
            this.map.style('position', 'relative');
        }
    }

    // 放大
    zoomIn() {
        this.zoomBy(1.2);
    }

    // 缩小
    zoomOut() {
        this.zoomBy(0.8);
    }

    // 按比例缩放
    zoomBy(scale) {
        const targetScale = this.currentTransform.k * scale;
        const [minScale, maxScale] = this.config.scaleExtent;

        if (targetScale < minScale || targetScale > maxScale) return;

        const centerX = this.config.width / 2;
        const centerY = this.config.height / 2;

        this.SVG.transition()
            .duration(300)
            .call(
                this.zoomBehavior.transform,
                d3.zoomIdentity
                    .translate(centerX, centerY)
                    .scale(targetScale)
                    .translate(-centerX, -centerY)
            );
    }

    // 重置视图
    resetView() {
        this.SVG.transition()
            .duration(500)
            .call(this.zoomBehavior.transform, d3.zoomIdentity);
        this.clearSearch();
        this.clearFocus();
    }

    // 切换聚焦模式
    toggleFocusMode() {
        this.isFocusMode = !this.isFocusMode;
        const btn = this.toolbar.select('.focus-mode');

        if (this.isFocusMode) {
            btn.style('background', '#e6f7ff')
               .style('border-color', '#1890ff')
               .style('color', '#1890ff')
               .text('聚焦中');
        } else {
            btn.style('background', '#fff')
               .style('border-color', '#d9d9d9')
               .style('color', '#666')
               .text('聚焦');
            this.clearFocus();
        }
    }

    // 清除聚焦
    clearFocus() {
        this.focusedNode = null;
        // 恢复所有节点和线的透明度
        this.SVG.selectAll('circle.circleclass')
            .transition()
            .duration(300)
            .style('opacity', this.config.opacityLevels.normal);
        this.SVG.selectAll('.edge')
            .transition()
            .duration(300)
            .style('opacity', this.config.opacityLevels.normal);
    }

    // 设置聚焦节点
    setFocusNode(node) {
        if (!this.isFocusMode) return;
        this.focusedNode = node;
        this.applyDistanceHighlight(node);
    }

    // 更新缩放显示
    updateZoomDisplay(transform) {
        if (this.zoomDisplay) {
            this.zoomDisplay.node().value = Math.round(transform.k * 100) + '%';
        }
    }

    // 处理手动输入的缩放值
    handleZoomInput(value) {
        // 解析输入值，支持 "100"、"100%"、"1.5" 等格式
        let numValue = parseFloat(value.replace('%', ''));

        if (isNaN(numValue)) {
            // 无效输入，恢复当前值
            this.zoomDisplay.node().value = Math.round(this.currentTransform.k * 100) + '%';
            return;
        }

        // 统一将输入值作为百分比处理，转换为 0-1 的缩放比例
        // 如果值大于 1，说明是百分比形式（如 50 表示 50%）
        // 如果值小于等于 1，说明已经是小数形式（如 0.5 表示 50%）
        let scale;
        if (numValue > 1) {
            scale = numValue / 100;  // 百分比转小数
        } else {
            scale = numValue;  // 已经是小数
        }

        // 限制在缩放范围内
        const [minScale, maxScale] = this.config.scaleExtent;
        scale = Math.max(minScale, Math.min(maxScale, scale));

        // 应用缩放
        const centerX = this.config.width / 2;
        const centerY = this.config.height / 2;

        this.SVG.transition()
            .duration(300)
            .call(
                this.zoomBehavior.transform,
                d3.zoomIdentity
                    .translate(centerX, centerY)
                    .scale(scale)
                    .translate(-centerX, -centerY)
            );

        // 更新显示值
        this.zoomDisplay.node().value = Math.round(scale * 100) + '%';
        this.zoomDisplay.node().blur();
    }

    // 计算节点的关系数量
    getNodeRelationCount(node) {
        if (!node) return 0;
        const nodeIndex = node.index;
        let count = 0;
        this.config.links.forEach(link => {
            if (link.source.index === nodeIndex || link.target.index === nodeIndex) {
                count++;
            }
        });
        return count;
    }

    // 处理搜索
    handleSearch(keyword, selectFirst = false) {
        const that = this;

        if (!keyword || keyword.trim() === '') {
            this.clearSearch();
            return;
        }

        const lowerKeyword = keyword.toLowerCase().trim();
        this.currentSearchResults = this.config.nodes.filter(node =>
            node.name && node.name.toLowerCase().includes(lowerKeyword)
        );

        if (this.currentSearchResults.length === 0) {
            this.searchResults.style('display', 'none');
            return;
        }

        if (selectFirst && this.currentSearchResults.length > 0) {
            this.locateNode(this.currentSearchResults[0]);
            this.searchResults.style('display', 'none');
            return;
        }

        // 重置选中索引
        this.selectedIndex = -1;
        this.renderSearchResults();
    }

    // 渲染搜索结果列表
    renderSearchResults() {
        const that = this;

        // 显示搜索结果
        this.searchResults
            .style('display', 'block')
            .html('');

        this.currentSearchResults.slice(0, 10).forEach((node, index) => {
            const relationCount = this.getNodeRelationCount(node);

            this.searchResults.append('div')
                .attr('class', 'search-result-item')
                .attr('data-index', index)
                .style('padding', '8px 12px')
                .style('cursor', 'pointer')
                .style('font-size', '13px')
                .style('border-bottom', '1px solid #f0f0f0')
                .style('transition', 'background 0.2s')
                .style('display', 'flex')
                .style('justify-content', 'space-between')
                .style('align-items', 'center')
                .style('background', index === this.selectedIndex ? '#e6f7ff' : '#fff')
                .html(`
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${node.name}</span>
                    <span style="color: #999; font-size: 12px; margin-left: 8px; flex-shrink: 0;">${relationCount}个关系</span>
                `)
                .on('click', () => {
                    this.selectAndFocusNode(node);
                    this.searchResults.style('display', 'none');
                })
                .on('mouseover', function() {
                    that.selectedIndex = index;
                    that.highlightSelectedItem();
                });
        });
    }

    // 高亮当前选中项
    highlightSelectedItem() {
        this.searchResults.selectAll('.search-result-item')
            .style('background', (d, i, nodes) => {
                const index = parseInt(d3.select(nodes[i]).attr('data-index'));
                return index === this.selectedIndex ? '#e6f7ff' : '#fff';
            });
    }

    // 处理键盘导航
    handleSearchKeydown(event) {
        if (this.currentSearchResults.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.currentSearchResults.length - 1, 9);
            this.highlightSelectedItem();
            this.scrollToSelectedItem();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.highlightSelectedItem();
            this.scrollToSelectedItem();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.selectedIndex >= 0 && this.selectedIndex < this.currentSearchResults.length) {
                this.selectAndFocusNode(this.currentSearchResults[this.selectedIndex]);
                this.searchResults.style('display', 'none');
            } else if (this.currentSearchResults.length > 0) {
                this.selectAndFocusNode(this.currentSearchResults[0]);
                this.searchResults.style('display', 'none');
            }
        } else if (event.key === 'Escape') {
            this.searchResults.style('display', 'none');
        }
    }

    // 选择节点并进入聚焦模式（只高亮一级关系）
    selectAndFocusNode(node) {
        if (!node || node.x === undefined || node.y === undefined) {
            console.warn('节点位置信息不可用');
            return;
        }

        // 1. 先定位到节点
        this.locateNode(node);

        // 2. 自动开启聚焦模式
        if (!this.isFocusMode) {
            this.isFocusMode = true;
            const btn = this.toolbar.select('.focus-mode');
            btn.style('background', '#e6f7ff')
               .style('border-color', '#1890ff')
               .style('color', '#1890ff')
               .text('聚焦中');
        }

        // 3. 设置聚焦节点并应用一级关系高亮
        this.focusedNode = node;
        this.applyDistanceHighlight(node);
    }

    // 滚动到选中项
    scrollToSelectedItem() {
        const items = this.searchResults.selectAll('.search-result-item').nodes();
        if (items[this.selectedIndex]) {
            items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    // 清除搜索
    clearSearch() {
        if (this.searchInput) {
            this.searchInput.node().value = '';
        }
        this.searchResults.style('display', 'none');
        // 清除聚焦状态和高亮效果
        this.focusedNode = null;
        // 恢复所有节点和线的透明度
        this.SVG.selectAll('circle.circleclass')
            .transition()
            .duration(300)
            .style('opacity', this.config.opacityLevels.normal)
            .attr('stroke', '#ccf1fc')
            .attr('stroke-width', this.config.strokeWidth);
        this.SVG.selectAll('.edge')
            .transition()
            .duration(300)
            .style('opacity', this.config.opacityLevels.normal);
    }

    // 定位到指定节点（优化版：居中显示 + 高亮关系网）
    locateNode(node) {
        if (!node || node.x === undefined || node.y === undefined) {
            console.warn('节点位置信息不可用，请等待布局完成后再试');
            return;
        }

        const scale = 1.5;
        const x = node.x;
        const y = node.y;
        const centerX = this.config.width / 2;
        const centerY = this.config.height / 2;

        // 计算平移量，使节点居中
        const translateX = centerX - x * scale;
        const translateY = centerY - y * scale;

        // 应用缩放和平移（使用保存的 zoomBehavior 引用）
        this.SVG.transition()
            .duration(750)
            .call(
                this.zoomBehavior.transform,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
            );

        // 设置聚焦节点并应用分级透明度高亮
        this.focusedNode = node;
        this.applyDistanceHighlight(node);

        // 额外高亮目标节点的边框（更明显的视觉效果）
        this.SVG.selectAll('circle.circleclass')
            .transition()
            .duration(300)
            .attr('stroke', (d) => {
                if (d.role_id === node.role_id) {
                    return '#ff4d4f'; // 目标节点用红色边框
                }
                return '#c5dbf0';
            })
            .attr('stroke-width', (d) => {
                if (d.role_id === node.role_id) {
                    return 6; // 目标节点边框加粗
                }
                return this.config.strokeWidth;
            });
    }

    // 创建力学模拟器
    initSimulation() {
        var that = this;

        // 1. 创建一个力学模拟器
        this.simulation = d3.forceSimulation(this.config.nodes)
        // simulation.force(name,[force])函数，添加某种力
            .force("link", d3.forceLink(this.config.links))
            // 万有引力
            .force("charge", d3.forceManyBody().strength(this.config.chargeStrength))
            // d3.forceCenter()用指定的x坐标和y坐标创建一个新的居中力。
            .force("center", d3.forceCenter(this.config.width / 2, this.config.height / 2))
            // 碰撞作用力，为节点指定一个radius区域来防止节点重叠，设置碰撞力的强度，范围[0,1], 默认为0.7。设置迭代次数，默认为1，迭代次数越多最终的布局效果越好，但是计算复杂度更高
            .force("collide", d3.forceCollide(this.config.collide).strength(0.2).iterations(5))
            // 在计时器的每一帧中，仿真的alpha系数会不断削减,当alpha到达一个系数时，仿真将会停止，也就是alpha的目标系数alphaTarget，该值区间为[0,1]. 默认为0，
            // 控制力学模拟衰减率，[0-1] ,设为0则不停止 ， 默认0.0228，直到0.001
            .alphaDecay(this.config.alphaDecay)
            // 监听事件 ，tick|end ，例如监听 tick 滴答事件
            .on("tick", () => this.ticked());

        // 2.创建svg标签
        // 先创建 zoom 行为，保存引用以便后续使用
        this.zoomBehavior = d3.zoom().scaleExtent(this.config.scaleExtent).on("zoom", () => {
            if (this.config.isScale) {
                this.currentTransform = d3.event.transform;
                this.relMap_g.attr("transform", d3.event.transform);
                this.updateZoomDisplay(d3.event.transform);
            }
        });

        this.SVG = this.map.append("svg")
            .attr("class", "svgclass")
            .attr("width", this.config.width)
            .attr("height", this.config.height)
            // .transition().duration(750).call(d3.zoom().transform, d3.zoomIdentity);
            .call(this.zoomBehavior)
            .on('click', () => console.log('画布 click'))
            .on("dblclick.zoom", null);

        // 3.defs  <defs>标签的内容不会显示，只有调用的时候才显示
        this.defs = this.SVG.append('defs');
        // 3.1 添加箭头
        this.marker = this.defs
            .append("marker")
            .attr('id', "marker")
            .attr("markerWidth", 10)    //marker视窗的宽
            .attr("markerHeight", 10)   //marker视窗的高
            .attr("refX", this.config.r + 3 * this.config.strokeWidth)            //refX和refY，指的是图形元素和marker连接的位置坐标
            .attr("refY", 4)
            .attr("orient", "auto")     //orient="auto"设置箭头的方向为自动适应线条的方向
            .attr("markerUnits", "userSpaceOnUse")  //marker是否进行缩放 ,默认值是strokeWidth,会缩放
            .append("path")
            .attr("d", "M 0 0 8 4 0 8Z")    //箭头的路径 从 （0,0） 到 （8,4） 到（0,8）
            .attr("fill", "steelblue");

        // 3.2 添加多个头像图片的 <pattern>
        this.patterns = this.defs
            .selectAll("pattern.patternclass")
            .data(this.config.nodes)
            .enter()
            .append("pattern")
            .attr("class", "patternclass")
            .attr("id", function (d, index) {
                return 'avatar' + d.role_id;
            })
            // 两个取值userSpaceOnUse  objectBoundingBox
            .attr('patternUnits', 'objectBoundingBox')
            // <pattern>，x、y值的改变决定图案的位置，宽度、高度默认为pattern图案占填充图形的百分比。
            .attr("x", "0")
            .attr("y", "0")
            .attr("width", "1")
            .attr("height", "1");

        // 3.3 向<defs> - <pattern>添加 头像
        this.patterns.append("image")
            .attr("class", "circle")
            .attr("xlink:href", function (d) {
                return d.avatar; // 修改节点头像
            })
            .attr("src", function (d) {
                return d.avatar; // 修改节点头像
            })
            .attr("height", this.config.r * 2)
            .attr("width", this.config.r * 2)
            .attr("preserveAspectRatio", "xMidYMin slice");

        // 3.4 名字
        this.patterns.append("rect").attr("x", "0").attr("y", 4 / 3 * this.config.r).attr("width", 2 * this.config.r).attr("height", 2 / 3 * this.config.r).attr("fill", "black").attr("opacity", "0.5");
        this.patterns.append("text").attr("class", "nodetext")
            .attr("x", this.config.r).attr("y", (5 / 3 * this.config.r))
            .attr('text-anchor', 'middle')
            .attr("fill", "#fff")
            .style("font-size", this.config.r / 3)
            .text(function (d) {
                return d.name;
            });


        // 4.放关系图的容器
        this.relMap_g = this.SVG.append("g")
            .attr("class", "relMap_g")
            .attr("width", this.config.width)
            .attr("height", this.config.height);

        // 5.关系图添加线
        // 5.1  每条线是个容器，有线 和一个装文字的容器
        this.edges = this.relMap_g
            .selectAll("g.edge")
            .data(this.config.links)
            .enter()
            .append("g")
            .attr("class", "edge")
            .on('mouseover', function () {
                d3.select(this).selectAll('path.links').attr('stroke-width', 4);
            })
            .on('mouseout', function () {
                d3.select(this).selectAll('path.links').attr('stroke-width', 1);
            })
            .on('click', function (d) {
                console.log('线click')
            })
            .attr('fill', function (d) {
                var str = '#bad4ed';
                if (d.color) {
                    str = "#" + d.color;
                }
                return str;
            })

        // 5.2 添加线
        this.links = this.edges.append("path").attr("class", "links")
            .attr("d", d => {
                return "M" + this.config.linkSrc + "," + 0 + " L" + getDis(d.source, d.target) + ",0";
            })
            .style("marker-end", "url(#marker)")
            // .attr("refX",this.config.r)
            .attr('stroke', (d) => {
                var str = d.color ? "#" + d.color : this.config.linkColor;
                return str;
            });

        // 5.3 添加关系文字的容器
        this.rect_g = this.edges.append("g").attr("class", "rect_g");

        // 5.4 添加rect
        this.rects = this.rect_g.append("rect")
            .attr("x", 40)
            .attr("y", -10)
            .attr("width", 40)
            .attr("height", 20)
            .attr("fill", "white")
            .attr('stroke', (d) => {
                var str = d.color ? "#" + d.color : this.config.linkColor;
                return str;
            })

        // 5.5 文本标签  坐标（x,y）代表 文本的左下角的点
        this.texts = this.rect_g.append("text")
            .attr("x", 40)
            .attr("y", 5)
            .attr("text-anchor", "middle")  // <text>文本中轴对齐方式居中  start | middle | end
            .style("font-size", 12).text(d => {
                return d.relation
            });


        // 6.关系图添加用于显示头像的节点
        this.circles = this.relMap_g.selectAll("circle.circleclass")
            .data(this.config.nodes)
            .enter()
            .append("circle")
            .attr("class", "circleclass")
            .style("cursor", "pointer")
            // .attr("cx", function (d) {
            //     return d.x;
            // })
            // .attr("cy", function (d) {
            //     return d.y;
            // })
            .attr("fill", function (d) {
                return ("url(#avatar" + d.role_id + ")");
            })
            .attr("stroke", "#ccf1fc")
            .attr("stroke-width", this.config.strokeWidth)
            .attr("r", this.config.r)
            .on('mouseover', function (d) {
                d3.select(this).attr('stroke-width', '8');
                d3.select(this).attr('stroke', '#a3e5f9');
                if (that.config.isHighLight) {
                    that.highlightObject(d);
                }
            })
            .on('mouseout', function (d) {
                d3.select(this).attr('stroke-width', that.config.strokeWidth);
                d3.select(this).attr('stroke', '#c5dbf0');
                if (that.config.isHighLight) {
                    that.highlightObject(null);
                }
            })
            .on('click', function (d) {
                console.log('头像节点click')

                // 如果处于聚焦模式，设置聚焦节点
                if (that.isFocusMode) {
                    that.setFocusNode(d);
                    return;
                }

                // 展示方式2 ：浮窗展示
                event = d3.event || window.event;
                var pageX = event.pageX ? event.pageX : (event.clientX + (document.body.scrollLeft || document.documentElement.scrollLeft));
                var pageY = event.pageY ? event.pageY : (event.clientY + (document.body.scrollTop || document.documentElement.scrollTop));
                // console.log('pagex', pageX);
                // console.log('pageY', pageY);
                //阻止事件冒泡  阻止事件默认行为
                event.stopPropagation ? (event.stopPropagation()) : (event.cancelBubble = true);
                event.preventDefault ? (event.preventDefault()) : (event.returnValue = false);


            })
            .on('contextmenu', function () {    //鼠标右键菜单
                event = event || window.event;
                event.cancelBubble = true;
                event.returnValue = false;
            })
            // 应用 自定义的 拖拽事件
            .call(d3.drag()
                .on('start', (d) => {
                    d3.event.sourceEvent.stopPropagation();
                    // restart()方法重新启动模拟器的内部计时器并返回模拟器。
                    // 与simulation.alphaTarget或simulation.alpha一起使用时，此方法可用于在交互
                    // 过程中进行“重新加热”模拟，例如在拖动节点时，在simulation.stop暂停之后恢复模拟。
                    // 当前alpha值为0，需设置alphaTarget让节点动起来
                    if (!d3.event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (d) => {

                    // d.fx属性- 节点的固定x位置
                    // 在每次tick结束时，d.x被重置为d.fx ，并将节点 d.vx设置为零
                    // 要取消节点，请将节点 .fx和节点 .fy设置为空，或删除这些属性。
                    d.fx = d3.event.x;
                    d.fy = d3.event.y;
                })
                .on('end', (d) => {

                    // 让alpha目标值值恢复为默认值0,停止力模型
                    if (!d3.event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));
    }

    ticked() {


        // 7.1 修改每条容器edge的位置
        this.edges.attr("transform", function (d) {
            return getTransform(d.source, d.target, getDis(d.source, d.target))
        });

        // 7.2 修改每条线link位置
        this.links.attr("d", d => {
            return "M" + this.config.linkSrc + "," + 0 + " L" + getDis(d.source, d.target) + ",0";
        })


        // 7.3 修改线中关系文字text的位置 及 文字的反正
        this.texts
            .attr("x", function (d) {
                // 7.3.1 根据字的长度来更新兄弟元素 rect 的宽度
                var bbox = d3.select(this).node().getBBox();
                var width = bbox.width;
                // ########################
                // $(this).prev('rect').attr('width', width + 10);
                // d3.select(this).prev('rect').attr('width', width + 10);
                // 7.3.2 更新 text 的位置
                return getDis(d.source, d.target) / 2
            })
            .attr("transform", function (d) {
                // 7.3.3 更新文本反正
                if (d.target.x < d.source.x) {
                    var x = getDis(d.source, d.target) / 2;
                    return 'rotate(180 ' + x + ' ' + 0 + ')';
                } else {
                    return 'rotate(0)';
                }
            });

        // 7.4 修改线中装文本矩形rect的位置
        this.rects
            .attr("x", function (d) {
                // ######################
                // return getDis(d.source, d.target) / 2 - $(this).attr('width') / 2
                return getDis(d.source, d.target) / 2 - d3.select(this).attr('width') / 2
            })    // x 坐标为两点中心距离减去自身长度一半

        // 5.修改节点的位置
        this.circles
            .attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            })

    }

    // 高亮元素及其相关的元素（优化版：按关系距离分级透明度）
    highlightObject(obj) {
        // 如果处于聚焦模式，不响应 hover 高亮
        if (this.isFocusMode && this.focusedNode) {
            return;
        }

        if (obj) {
            this.applyDistanceHighlight(obj);
        } else {
            // 取消高亮 - 恢复所有元素透明度
            this.SVG.selectAll('circle.circleclass')
                .transition()
                .duration(200)
                .style('opacity', this.config.opacityLevels.normal);
            this.SVG.selectAll('.edge')
                .transition()
                .duration(200)
                .style('opacity', this.config.opacityLevels.normal);
            this.dependsNode = [];
            this.dependsLinkAndText = [];
        }
    }

    // 根据距离应用高亮效果（简化版：只区分直接关联和无关节点）
    applyDistanceHighlight(targetNode) {
        const objIndex = targetNode.index;
        const opacity = this.config.opacityLevels;

        // 收集一度关系节点
        const directNodes = new Set([objIndex]);
        const directLinks = new Set();

        // 遍历所有连接，收集直接关系节点
        this.config.links.forEach((link, linkIndex) => {
            const sourceIdx = link.source.index;
            const targetIdx = link.target.index;

            if (objIndex === sourceIdx) {
                directNodes.add(targetIdx);
                directLinks.add(linkIndex);
            } else if (objIndex === targetIdx) {
                directNodes.add(sourceIdx);
                directLinks.add(linkIndex);
            }
        });

        // 应用节点透明度：直接关联清晰，其他透明
        this.SVG.selectAll('circle.circleclass')
            .transition()
            .duration(200)
            .style('opacity', (d) => {
                return directNodes.has(d.index) ? opacity.direct : opacity.unrelated;
            });

        // 应用连线透明度：直接关联清晰，其他透明
        this.SVG.selectAll('.edge')
            .transition()
            .duration(200)
            .style('opacity', (d, i) => {
                return directLinks.has(i) ? opacity.direct : opacity.unrelated;
            });
    }
}

// console.log(RelationChart)

(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory :
        (global = global || self, global.RelationChart = factory);
}(this, RelationChart))

