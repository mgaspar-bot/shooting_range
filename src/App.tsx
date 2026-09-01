import { useEffect, useRef } from 'react'
import './App.css'
import { ThreeApp } from './three/ThreeApp'



function App() {


  useEffect(()=> { // runs after first render, and each render after that if the dependencies change (none in this case)

    const canvasElement = document.querySelector("#canvas")

    if (!canvasElement) {
      console.error("Canvas not found");
      return
    }

    const app = new ThreeApp(canvasElement as HTMLElement)
    
    return () => {app.destroy()}

  }, [])

  return (
    <div className="App">
      <div id="canvas"></div>
    </div>
  ) ;
}

export default App

/**
 * Aviam que volem, pensemho.
 * Primer voldria una sala que serveixi com a recepció, amb taulell i un recepcionista.
 *    Aquí hi ha el (molt senzill) login form i el botó per entrar.
 *    Un cop autenticat, et pots moure amb la càmera i entrar al shooting range.
 * 
 * Ara per ara, volem una forma de fer la sala fàcilment.
 *    Em falten textures i els quatre plans. Potser ho podem posar tot en una sola funció
 * 
 * A nivell d'estructura de components, com hauria de casar això amb React?
 *  Tot va dins App.tsx? 
 */
