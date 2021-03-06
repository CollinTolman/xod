import React from 'react';
import { HotKeys } from 'react-hotkeys';
import * as XP from 'xod-project';

import { COMMAND } from '../../../../utils/constants';

import PatchSVG from '../../../../project/components/PatchSVG';
import * as Layers from '../../../../project/components/layers';

import {
  snapPositionToSlots,
  pixelPositionToSlots,
} from '../../../../project/nodeLayout';

import { getOffsetMatrix, bindApi, getMousePosition } from '../modeUtils';

const abort = api => {
  api.props.actions.deselectAll();
  api.goToDefaultMode();
};

let patchSvgRef = null;

const linkingMode = {
  getInitialState(props, { mousePosition }) {
    return {
      mousePosition,
    };
  },

  onMouseMove(api, event) {
    const mousePosition = getMousePosition(patchSvgRef, api.getOffset(), event);
    api.setState({ mousePosition });
  },
  onPinMouseDown(api, event, nodeId, pinKey) {
    api.props.actions.linkPin(nodeId, pinKey);
    api.goToDefaultMode();
  },
  onPinMouseUp(api, event, nodeId, pinKey) {
    const lp = api.props.linkingPin;
    const firstPinClick = !lp || (nodeId === lp.nodeId && pinKey === lp.pinKey);

    if (firstPinClick) {
      return;
    }

    api.props.actions.linkPin(nodeId, pinKey);
    api.goToDefaultMode();
  },
  onCreateBus(api) {
    const { nodeId, pinKey } = api.props.linkingPin;
    const node = api.props.nodes[nodeId];

    const mouseSlotPosition = pixelPositionToSlots(
      snapPositionToSlots(api.state.mousePosition)
    );

    api.props.actions.addBusNode(
      api.props.patchPath,
      mouseSlotPosition,
      node,
      pinKey
    );
    api.goToDefaultMode();
  },
  onCreateTerminal(api) {
    const { nodeId, pinKey } = api.props.linkingPin;
    const node = api.props.nodes[nodeId];

    const mouseSlotPosition = pixelPositionToSlots(
      snapPositionToSlots(api.state.mousePosition)
    );

    api.props.actions.addTerminalNode(
      api.props.patchPath,
      mouseSlotPosition,
      node,
      pinKey
    );
    api.goToDefaultMode();
  },
  onCreateConstant(api) {
    const { nodeId, pinKey } = api.props.linkingPin;

    const node = api.props.nodes[nodeId];
    const pin = node.pins[pinKey];
    if (
      pin.direction === XP.PIN_DIRECTION.OUTPUT ||
      pin.type === XP.PIN_TYPE.PULSE ||
      XP.isGenericType(pin.type)
    )
      return;

    const mouseSlotPosition = pixelPositionToSlots(
      snapPositionToSlots(api.state.mousePosition)
    );
    api.props.actions.addConstantNode(
      api.props.patchPath,
      mouseSlotPosition,
      node,
      pinKey
    );
    api.goToDefaultMode();
  },
  onCreateTweakOrWatch(api) {
    const { nodeId, pinKey } = api.props.linkingPin;
    const node = api.props.nodes[nodeId];
    const pin = node.pins[pinKey];

    const isInput = pin.direction === XP.PIN_DIRECTION.INPUT;
    const isOutputPulse = !isInput && pin.type === XP.PIN_TYPE.PULSE;
    const isGenericInput = isInput && XP.isGenericType(pin.type);
    const isCustomInput = isInput && !XP.isBuiltInType(pin.type);
    // Do not create watches for output pulses,
    // tweaks for generic inputs and custom types
    if (isOutputPulse || isGenericInput || isCustomInput) return;

    const mouseSlotPosition = pixelPositionToSlots(
      snapPositionToSlots(api.state.mousePosition)
    );
    api.props.actions.addInteractiveNode(
      api.props.patchPath,
      mouseSlotPosition,
      node,
      pinKey
    );
    api.goToDefaultMode();
  },
  onBackgroundClick: abort,
  getHotkeyHandlers(api) {
    return {
      [COMMAND.DESELECT]: () => abort(api),
      [COMMAND.MAKE_BUS]: bindApi(api, this.onCreateBus),
      [COMMAND.MAKE_TERMINAL]: bindApi(api, this.onCreateTerminal),
      [COMMAND.MAKE_CONSTANT]: bindApi(api, this.onCreateConstant),
      [COMMAND.MAKE_INTERACTIVE]: bindApi(api, this.onCreateTweakOrWatch),
    };
  },
  render(api) {
    return (
      <HotKeys handlers={this.getHotkeyHandlers(api)} className="PatchWrapper">
        <PatchSVG
          onMouseMove={bindApi(api, this.onMouseMove)}
          svgRef={svg => {
            patchSvgRef = svg;
          }}
        >
          <Layers.Background
            width={api.props.size.width}
            height={api.props.size.height}
            onClick={bindApi(api, this.onBackgroundClick)}
            offset={api.getOffset()}
          />
          <g transform={getOffsetMatrix(api.getOffset())}>
            <Layers.Comments
              comments={api.props.comments}
              selection={api.props.selection}
              onFinishEditing={api.props.actions.editComment}
            />
            <Layers.Links
              links={api.props.links}
              selection={api.props.selection}
            />
            <Layers.Nodes
              nodes={api.props.nodes}
              selection={api.props.selection}
              linkingPin={api.props.linkingPin}
            />
            <Layers.LinksOverlay
              links={api.props.links}
              selection={api.props.selection}
            />
            <Layers.NodePinsOverlay
              nodes={api.props.nodes}
              linkingPin={api.props.linkingPin}
              onPinMouseDown={bindApi(api, this.onPinMouseDown)}
              onPinMouseUp={bindApi(api, this.onPinMouseUp)}
            />

            <Layers.Ghosts
              mousePosition={api.state.mousePosition}
              mode={api.getCurrentMode()}
              ghostLink={api.props.ghostLink}
            />
          </g>
        </PatchSVG>
      </HotKeys>
    );
  },
};

export default linkingMode;
