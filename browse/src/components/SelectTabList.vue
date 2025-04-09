<script lang="ts">
import TabListItem from "@/components/TabListItem.vue";

export default {
  name: "SelectTabList",
  props: {
    value: {
      type: Number,
      required: true,
    },
    showTabs: {
      type: Boolean,
      required: true,
    },
    collapsed: {
      type: Boolean,
      default: true,
    },
  },
  functional: true,
  render(createElement, context) {
    const nodes = context.children.filter((node) => node.text === undefined);
    const selectedOption = nodes[context.props.value];
    const options = [
      createElement(
        "div",
        {
          class: {
            "tab-list": true,
            collapsed: context.props.collapsed,
          },
        },
        nodes.map((node, index) => {
          if (
            !context.props.collapsed ||
            (context.props.collapsed && node === selectedOption)
          ) {
            return createElement(TabListItem, {
              props: {
                index,
                showTabs: context.props.showTabs,
                selected: node === selectedOption,
                title: node.componentOptions.propsData.title,
              },
              scopedSlots: {
                title() {
                  if (node.data.scopedSlots && node.data.scopedSlots.title) {
                    return node.data.scopedSlots.title();
                  } else {
                    return node.componentOptions.propsData.title;
                  }
                },
              },
            });
          }
        }),
      ),
    ];
    // Add the actual content at the bottom of the list
    options.push(
      createElement(
        "div",
        {
          class: {
            "tab-content": true,
            "card-body": true,
          },
        },
        selectedOption && selectedOption.componentOptions.children,
      ),
    );
    return createElement(
      "div",
      {
        style: {
          top: 0,
        },
        class: {
          tabs: true,
          "device-tabs": true,
        },
      },
      options,
    );
  },
};
</script>

<style scoped>
.tab-list {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid #eee;
}
</style>
