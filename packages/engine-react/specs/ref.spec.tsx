// tslint:disable:no-expression-statement
import React from "react";
import {
  Get,
  Set,
  Ref,
  Merge,
  Prop,
  Arg,
  view,
  producer,
} from "@c11/engine.macro";
import { waitForElement, getByTestId, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import { Engine } from "../src/engine";

jest.useFakeTimers();

// @ts-ignore

beforeEach(() => {
  document.body.innerHTML = "";
});

test("Expect to call using only Ref", done => {
  const defaultState = {
    foo: "123",
  };
  const rootEl = document.createElement("div");
  rootEl.setAttribute("id", "root");
  document.body.appendChild(rootEl);
  const Component = view((foo = Ref.foo) => {
    expect(foo).toBeDefined();
    return <div data-testid="foo">{foo.get()}</div>;
  });
  const engine = new Engine({
    state: {
      initial: defaultState,
    },
    view: {
      element: <Component />,
      root: rootEl,
    },
  });
  engine.start();
  jest.runAllTimers();
  waitForElement(() => getByTestId(document.body, "foo")).then(x => {
    expect(x.innerHTML).toBe(defaultState.foo);
    done();
  });
});